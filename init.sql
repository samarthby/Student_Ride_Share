-- Create database (optional, if not already created)
CREATE DATABASE IF NOT EXISTS ride_share;
USE ride_share;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(15) NOT NULL UNIQUE,
    user_type ENUM('driver','passenger') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rides table
CREATE TABLE IF NOT EXISTS rides (
    ride_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    start_lat DECIMAL(10,8) NOT NULL,
    start_lng DECIMAL(11,8) NOT NULL,
    end_lat DECIMAL(10,8) NOT NULL,
    end_lng DECIMAL(11,8) NOT NULL,
    route_polyline TEXT NOT NULL,
    source_name VARCHAR(255) DEFAULT NULL,
    destination_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    available_seats INT NOT NULL,
    price_per_seat DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES users(user_id)
);

-- Passenger Requests table
CREATE TABLE IF NOT EXISTS passenger_requests (
    request_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    passenger_id INT NOT NULL,
    boarding_lat DECIMAL(10,8) NOT NULL,
    boarding_lng DECIMAL(11,8) NOT NULL,
    status ENUM('pending','confirmed','rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id),
    FOREIGN KEY (passenger_id) REFERENCES users(user_id)
);

-- Ride History table
CREATE TABLE IF NOT EXISTS ride_history (
    history_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    passenger_id INT NOT NULL,
    boarding_lat DECIMAL(10,8) NOT NULL,
    boarding_lng DECIMAL(11,8) NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id),
    FOREIGN KEY (passenger_id) REFERENCES users(user_id)
);

-- Ride Locations (for live tracking)
CREATE TABLE IF NOT EXISTS ride_locations (
    location_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    current_lat DECIMAL(10,8) NOT NULL,
    current_lng DECIMAL(11,8) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
);
