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

    const checkDriverSql = 'SELECT * FROM users WHERE user_id = ? AND user_type = "driver"';
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

// Start the Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
