require('dotenv').config(); // Load environment variables

const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');

const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// MySQL Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('✅ Connected to the MySQL database.');
});

// API Endpoint to Store Ride Details
app.post('/api/offer-ride', (req, res) => {
    const {
        driver_id, start_lat, start_lng,
        end_lat, end_lng, route_polyline,
        source_name, destination_name, date, time,
        available_seats, price_per_seat,
        vehicle_type, vehicle_number // <-- new fields
    } = req.body;

    const checkDriverSql = 'SELECT * FROM users WHERE user_id = ?';
    db.query(checkDriverSql, [driver_id], (err, results) => {
        if (err) {
            console.error('Error checking driver:', err);
            return res.status(500).json({ message: 'Internal server error.' });
        }

        if (results.length === 0) {
            return res.status(400).json({ message: 'Driver does not exist.' });
        }

        const insertRideSql = `
            INSERT INTO rides (
                driver_id, start_lat, start_lng,
                end_lat, end_lng, route_polyline,
                source_name, destination_name, date, time,
                available_seats, price_per_seat, vehicle_type, vehicle_number, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        db.query(insertRideSql, [
            driver_id, start_lat, start_lng,
            end_lat, end_lng, route_polyline,
            source_name, destination_name, date, time,
            available_seats, price_per_seat, vehicle_type, vehicle_number
        ], (err, result) => {
            if (err) {
                console.error('Error inserting ride details:', err);
                return res.status(500).json({ message: 'Failed to store ride details.' });
            }

            res.status(200).json({
                message: 'Ride details stored successfully.',
                ride_id: result.insertId
            });
        });
    });
});



// API Endpoint to Search Rides by Destination Name
app.get('/api/search-rides', (req, res) => {
    const destination = req.query.destination;

    if (!destination) {
        return res.status(400).json({ error: 'Destination is required' });
    }

    const query = `
        SELECT r.ride_id, r.driver_id, u.name AS driver_name, r.source_name, r.destination_name,
               r.start_lat, r.start_lng, r.end_lat, r.end_lng,
               r.date, r.time, 
               (r.available_seats - IFNULL(bp.boarded,0)) AS available_seats,
               r.price_per_seat, r.vehicle_type
        FROM rides r
        JOIN users u ON r.driver_id = u.user_id
        LEFT JOIN (
            SELECT ride_id, COUNT(*) AS boarded
            FROM ride_boarding_points
            GROUP BY ride_id
        ) bp ON r.ride_id = bp.ride_id
        WHERE r.destination_name LIKE ? AND (r.available_seats - IFNULL(bp.boarded,0)) > 0
        ORDER BY r.date, r.time
    `;

    db.query(query, [`%${destination}%`], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});


// API Endpoint to Fetch Ride Details by ID
app.get('/api/ride-details', (req, res) => {
    const rideId = req.query.ride_id;

    const query = `
        SELECT start_lat, start_lng, end_lat, end_lng, route_polyline
        FROM rides
        WHERE ride_id = ?
    `;

    db.query(query, [rideId], (err, results) => {
        if (err) {
            console.error('Error fetching ride details:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        res.json(results[0]);
    });
});

// API Endpoint to fetch rides posted by the logged-in user (driver)
app.get('/api/my-offered-rides', (req, res) => {
    const { email, user_id } = req.query;
    if (email) {
        db.query(
            `SELECT r.* FROM rides r
             JOIN users u ON r.driver_id = u.user_id
             WHERE u.email = ?
             ORDER BY r.created_at DESC`,
            [email],
            (err, results) => {
                if (err) return res.json([]);
                res.json(results);
            }
        );
    } else if (user_id) {
        db.query(
            'SELECT * FROM rides WHERE driver_id = ? ORDER BY created_at DESC',
            [user_id],
            (err, results) => {
                if (err) return res.json([]);
                res.json(results);
            }
        );
    } else {
        res.json([]);
    }
});

// Signup endpoint
app.post('/api/signup', (req, res) => {
    const { email, password, name, phone } = req.body;
    if (!email || !password || !name || !phone) {
        return res.json({ success: false, message: 'All fields are required.' });
    }
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        if (results.length > 0) {
            return res.json({ success: false, message: 'Email already registered.' });
        }
        db.query(
            'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
            [name, email, phone, password],
            (err, result) => {
                if (err) return res.json({ success: false, message: 'Database error.' });
                return res.json({ success: true, user_id: result.insertId, name, email, phone });
            }
        );
    });
});

// Login endpoint
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.json({ success: false, message: 'Email and password required.' });
    }
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        if (results.length === 0) {
            return res.json({ success: false, message: 'User not found.' });
        }
        const user = results[0];
        if (user.password !== password) {
            return res.json({ success: false, message: 'Incorrect password.' });
        }
        return res.json({ success: true, user_id: user.user_id, name: user.name, email: user.email, phone: user.phone });
    });
});

// Endpoint to save passenger boarding point
app.post('/api/boarding-point', (req, res) => {
    const { ride_id, passenger_id, boarding_lat, boarding_lng } = req.body;
    if (!ride_id || !passenger_id || !boarding_lat || !boarding_lng) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    db.query(
        'INSERT INTO ride_boarding_points (ride_id, passenger_id, boarding_lat, boarding_lng) VALUES (?, ?, ?, ?)',
        [ride_id, passenger_id, boarding_lat, boarding_lng],
        (err, result) => {
            if (err) {
                console.error('Error saving boarding point:', err);
                return res.status(500).json({ message: 'Failed to save boarding point.' });
            }
            res.json({ message: 'Boarding point saved.' });
        }
    );
});

// Enhanced endpoint for boarding points with passenger info
app.get('/api/boarding-points', (req, res) => {
    const { ride_id } = req.query;
    if (!ride_id) return res.status(400).json({ message: 'ride_id required.' });
    db.query(
        `SELECT bp.*, u.name AS passenger_name, u.phone AS passenger_phone
         FROM ride_boarding_points bp
         JOIN users u ON bp.passenger_id = u.user_id
         WHERE bp.ride_id = ?`,
        [ride_id],
        (err, results) => {
            if (err) {
                console.error('Error fetching boarding points:', err);
                return res.status(500).json({ message: 'Failed to fetch boarding points.' });
            }
            res.json(results);
        }
    );
});

// Get rides where user is a passenger (has a boarding point)
app.get('/api/my-boarded-rides', (req, res) => {
    const passenger_id = req.query.passenger_id;
    if (!passenger_id) return res.json([]);
    db.query(
        `SELECT r.ride_id, r.source_name, r.destination_name, r.date, r.time, r.route_polyline, 
                r.start_lat, r.start_lng, r.end_lat, r.end_lng, 
                r.price_per_seat, r.vehicle_type, r.vehicle_number, u.name AS driver_name,
                bp.boarding_lat, bp.boarding_lng
         FROM ride_boarding_points bp
         JOIN rides r ON bp.ride_id = r.ride_id
         JOIN users u ON r.driver_id = u.user_id
         WHERE bp.passenger_id = ?`,
        [passenger_id],
        (err, results) => {
            if (err) return res.json([]);
            res.json(results);
        }
    );
});

// Geocoding proxy endpoint (fixes CORS/403 for Nominatim)
app.get('/api/geocode', async (req, res) => {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Missing query' });
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: { format: 'json', q },
            headers: { 'User-Agent': 'YourAppName/1.0 (your@email.com)' }
        });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'Geocoding failed' });
    }
});


// Save or update driver's current location for a ride
app.post('/api/ride-location', (req, res) => {
    const { ride_id, current_lat, current_lng } = req.body;
    if (!ride_id || !current_lat || !current_lng) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    // Upsert: if exists, update; else, insert
    db.query(
        `INSERT INTO ride_locations (ride_id, current_lat, current_lng)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE current_lat = VALUES(current_lat), current_lng = VALUES(current_lng), updated_at = NOW()`,
        [ride_id, current_lat, current_lng],
        (err) => {
            if (err) {
                console.error('Error saving ride location:', err);
                return res.status(500).json({ message: 'Failed to save location.' });
            }
            res.json({ message: 'Location updated.' });
        }
    );
});

// Get latest driver's location for a ride
app.get('/api/ride-location', (req, res) => {
    const { ride_id } = req.query;
    if (!ride_id) return res.status(400).json({ message: 'ride_id required.' });
    db.query(
        'SELECT current_lat, current_lng, updated_at FROM ride_locations WHERE ride_id = ? ORDER BY updated_at DESC LIMIT 1',
        [ride_id],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'Failed to fetch location.' });
            if (!results.length) return res.status(404).json({ message: 'No location found.' });
            res.json(results[0]);
        }
    );
});


// Update Profile endpoint
app.put('/api/update-profile', (req, res) => {
    const { user_id, name, email, phone } = req.body;

    if (!user_id || !name || !email || !phone) {
        return res.json({ success: false, message: 'All fields are required.' });
    }

    const sql = `UPDATE users SET name = ?, email = ?, phone = ? WHERE user_id = ?`;
    db.query(sql, [name, email, phone, user_id], (err, result) => {
        if (err) {
            console.error('Error updating profile:', err);
            return res.json({ success: false, message: 'Database error.' });
        }
        return res.json({ success: true, message: 'Profile updated successfully.' });
    });
});

// Delete ride endpoint
app.delete('/api/ride/:ride_id', (req, res) => {
    const rideId = req.params.ride_id;
    db.query(
        `SELECT bp.*, r.driver_id, r.vehicle_type, r.price_per_seat, r.date, r.time, r.source_name, r.destination_name
         FROM ride_boarding_points bp
         JOIN rides r ON bp.ride_id = r.ride_id
         WHERE bp.ride_id = ?`,
        [rideId],
        (err, boardingPoints) => {
            if (err) return res.status(500).json({ message: 'Failed to fetch boarding points.' });
            // Use source_name and destination_name for history
            const values = boardingPoints.map(bp => [
                bp.ride_id, bp.driver_id, bp.passenger_id,
                bp.source_name, bp.destination_name,
                bp.price_per_seat, bp.date, bp.time, bp.vehicle_type
            ]);
            if (values.length) {
                db.query(
                    `INSERT INTO history (ride_id, driver_id, passenger_id, source_name, destination_name, price, date, time, vehicle_type)
                     VALUES ?`,
                    [values],
                    (err2) => {
                        if (err2) return res.status(500).json({ message: 'Failed to store history.' });
                        db.query('DELETE FROM ride_boarding_points WHERE ride_id = ?', [rideId], () => {
                            db.query('DELETE FROM rides WHERE ride_id = ?', [rideId], () => {
                                res.json({ message: 'Ride completed and history stored.' });
                            });
                        });
                    }
                );
            } else {
                db.query('DELETE FROM rides WHERE ride_id = ?', [rideId], () => {
                    res.json({ message: 'Ride deleted.' });
                });
            }
        }
    );
});

app.get('/api/history', (req, res) => {
    const userId = req.query.user_id;
    db.query(
        `SELECT source_name, destination_name, price, date, time, vehicle_type
         FROM history WHERE driver_id = ? OR passenger_id = ? ORDER BY date DESC, time DESC`,
        [userId, userId],
        (err, results) => {
            if (err) return res.json([]);
            res.json(results);
        }
    );
});

app.get('/api/income', (req, res) => {
    const userId = req.query.user_id;
    db.query(
        `SELECT SUM(price) AS totalIncome FROM history WHERE driver_id = ?`,
        [userId],
        (err, totalRows) => {
            db.query(
                `SELECT vehicle_type, SUM(price) AS total FROM history WHERE driver_id = ? GROUP BY vehicle_type`,
                [userId],
                (err2, vehicleRows) => {
                    db.query(
                        `SELECT DATE_FORMAT(date, '%Y-%m') AS month, SUM(price) AS total FROM history WHERE driver_id = ? GROUP BY month`,
                        [userId],
                        (err3, monthRows) => {
                            res.json({
                                totalIncome: totalRows[0]?.totalIncome || 0,
                                vehicleTypes: vehicleRows,
                                months: monthRows
                            });
                        }
                    );
                }
            );
        }
    );
});

app.get('/api/income-charts', (req, res) => {
    const userId = req.query.user_id;
    // Total Income
    db.query(
        `SELECT SUM(price) AS totalIncome FROM history WHERE driver_id = ?`,
        [userId],
        (err, totalRows) => {
            // Income by Vehicle Type
            db.query(
                `SELECT vehicle_type, SUM(price) AS total FROM history WHERE driver_id = ? GROUP BY vehicle_type`,
                [userId],
                (err2, vehicleRows) => {
                    // Monthly Income
                    db.query(
                        `SELECT DATE_FORMAT(date, '%Y-%m') AS month, SUM(price) AS total FROM history WHERE driver_id = ? GROUP BY month ORDER BY month DESC LIMIT 6`,
                        [userId],
                        (err3, monthRows) => {
                            // Rides Per Day
                            db.query(
                                `SELECT date, COUNT(*) AS count FROM history WHERE driver_id = ? GROUP BY date ORDER BY date DESC LIMIT 7`,
                                [userId],
                                (err4, ridesPerDay) => {
                                    // Rides Completed Per Month
                                    db.query(
                                        `SELECT DATE_FORMAT(date, '%Y-%m') AS month, COUNT(*) AS count FROM history WHERE driver_id = ? GROUP BY month ORDER BY month DESC LIMIT 6`,
                                        [userId],
                                        (err5, ridesPerMonth) => {
                                            // Top Routes
                                            db.query(
                                                `SELECT CONCAT(source_name, ' → ', destination_name) AS route, COUNT(*) AS count
                                                 FROM history WHERE driver_id = ? GROUP BY route ORDER BY count DESC LIMIT 5`,
                                                [userId],
                                                (err6, topRoutes) => {
                                                    res.json({
                                                        totalIncome: totalRows[0]?.totalIncome || 0,
                                                        vehicleTypes: vehicleRows,
                                                        months: monthRows,
                                                        ridesPerDay,
                                                        ridesPerMonth,
                                                        topRoutes
                                                    });
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// Start the Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
