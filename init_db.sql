-- AI-Powered Sugarcane Farmer Management System
-- Database Initialization & Reset Script for MySQL
--
-- How to run this script:
-- Option A (MySQL Workbench): Open this file and click the Execute (⚡) button.
-- Option B (Command Line): mysql -u root -p < init_db.sql

-- Create the database if it doesn't already exist
CREATE DATABASE IF NOT EXISTS sugarcane_db;
USE sugarcane_db;

-- Safely drop existing table when resetting
DROP TABLE IF EXISTS farmers;

-- Create farmers table with stored generated columns and integrity constraints
CREATE TABLE farmers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    farmer_name VARCHAR(100) NOT NULL,
    village VARCHAR(100) NOT NULL,
    sugarcane_tonnes DECIMAL(10,2) NOT NULL,
    rate_per_tonne DECIMAL(10,2) NOT NULL DEFAULT 3200.00,
    total_amount DECIMAL(12,2) GENERATED ALWAYS AS (sugarcane_tonnes * rate_per_tonne) STORED,
    amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount_pending DECIMAL(12,2) GENERATED ALWAYS AS (sugarcane_tonnes * rate_per_tonne - amount_paid) STORED,
    CONSTRAINT chk_sugarcane_tonnes CHECK (sugarcane_tonnes >= 0),
    CONSTRAINT chk_rate_per_tonne CHECK (rate_per_tonne >= 0),
    CONSTRAINT chk_amount_paid_positive CHECK (amount_paid >= 0),
    CONSTRAINT chk_amount_paid_limit CHECK (amount_paid <= sugarcane_tonnes * rate_per_tonne)
);

-- Insert ten demonstration farmer records
INSERT INTO farmers
    (farmer_name, village, sugarcane_tonnes, amount_paid)
VALUES
    ('Rahul Shinde', 'Kopargaon', 25.00, 50000),
    ('Suresh Jadhav', 'Yeola', 30.00, 70000),
    ('Vijay Pawar', 'Sakuri', 18.50, 30000),
    ('Ganesh More', 'Kolpewadi', 40.00, 100000),
    ('Sunil Wagh', 'Savalivihir', 22.00, 40000),
    ('Prakash Shinde', 'Kopargaon', 35.00, 80000),
    ('Ramesh Patil', 'Yeola', 15.00, 20000),
    ('Dattatray Kale', 'Sakuri', 28.00, 50000),
    ('Ashok Gaikwad', 'Karanji', 32.00, 90000),
    ('Mahesh Bhosale', 'Kolpewadi', 20.00, 25000);
