require('dotenv').config(); // Load environment variables

const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');

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
        available_seats, price_per_seat
    } = req.body;

    // Remove user_type check, just check if user exists
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
                available_seats, price_per_seat, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        db.query(insertRideSql, [
            driver_id, start_lat, start_lng,
            end_lat, end_lng, route_polyline,
            source_name, destination_name, date, time,
            available_seats, price_per_seat
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
        SELECT ride_id, driver_id, source_name, destination_name,
               start_lat, start_lng, end_lat, end_lng,
               time, available_seats, price_per_seat
        FROM rides
        WHERE destination_name LIKE ?
    `;

    db.query(query, [`%${destination}%`], (err, results) => {
        if (err) {
            console.error('Error fetching rides:', err);
            return res.status(500).json({ error: 'Internal server error' });
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
                bp.boarding_lat, bp.boarding_lng
         FROM ride_boarding_points bp
         JOIN rides r ON bp.ride_id = r.ride_id
         WHERE bp.passenger_id = ?`,
        [passenger_id],
        (err, results) => {
            if (err) return res.json([]);
            res.json(results);
        }
    );
});

// Start the Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
