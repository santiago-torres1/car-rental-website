const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.urlencoded({ extended: false }));

// Database connection
const connection = mysql.createConnection({
  host: 'car-rental-db.cn2isckwenn7.ca-central-1.rds.amazonaws.com',
  user: 'admin',
  password: 'Secret55*',
  database: 'car_rental_database'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to the RDS instance:', err);
    return;
  }
  console.log('Successfully connected to the RDS instance');
  
  // Create tables if they don't exist
  const createUsersTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phoneNumber VARCHAR(20),
      password VARCHAR(255) NOT NULL
    )
  `;
  connection.query(createUsersTableQuery, (err, results) => {
    if (err) {
      console.error('Error creating users table:', err);
      return;
    }
    console.log('Table "users" is ready');
  });

  const createCarsTableQuery = `
    CREATE TABLE IF NOT EXISTS cars (
      id INT AUTO_INCREMENT PRIMARY KEY,
      make VARCHAR(255) NOT NULL,
      model VARCHAR(255) NOT NULL,
      year INT NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      available BOOLEAN DEFAULT TRUE
    )
  `;
  connection.query(createCarsTableQuery, (err, results) => {
    if (err) {
      console.error('Error creating cars table:', err);
      return;
    }
    console.log('Table "cars" is ready');
  });

  const createReviewsTableQuery = `
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      carId INT NOT NULL,
      userId INT NOT NULL,
      review TEXT,
      rating INT CHECK (rating BETWEEN 1 AND 5),
      FOREIGN KEY (carId) REFERENCES cars(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `;
  connection.query(createReviewsTableQuery, (err, results) => {
    if (err) {
      console.error('Error creating reviews table:', err);
      return;
    }
    console.log('Table "reviews" is ready');
  });
});

// REST API Endpoints

// Get all cars
app.get('/cars/:carId', (req, res) => {
  const { carId } = req.params;
  const query = 'SELECT * FROM cars WHERE id = ?';
  connection.query(query, [carId], (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results[0]);
    console.log(results);
  });
});

app.get('/cars', (req, res) => {
  connection.query('SELECT * FROM cars', (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results);
  });
});

// Rent a car
app.post('/book', (req, res) => {
  const { firstName, lastName, phoneNumber, email, carId, startDate, startTime, endDate, endTime, totalPrice, tax, serviceFee, finalTotal } = req.body;
  // Start a transaction
  connection.beginTransaction((err) => {
    if (err) return res.status(500).send(err);

    // Step 1: Update car availability
    const updateCarQuery = 'UPDATE cars SET available = FALSE WHERE id = ?';
    connection.query(updateCarQuery, [carId], (err) => {
      if (err) return connection.rollback(() => res.status(500).send(err));

      // Step 2: Generate new booking ID
      const getLastBookingIdQuery = 'SELECT MAX(id) AS lastId FROM bookings';
      connection.query(getLastBookingIdQuery, (err, results) => {
        if (err) return connection.rollback(() => res.status(500).send(err));

        const lastId = results[0].lastId || 100000; // Starting point
        const bookingId = lastId + 1; // Increment

        // Step 3: Insert booking details
        const insertBookingQuery = `
          INSERT INTO bookings (id, first_name, last_name, phone_number, email, car_id, start_date, start_time, end_date, end_time, total_price, tax, service_fee, final_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const bookingValues = [bookingId, firstName, lastName, phoneNumber, email, carId, startDate, startTime, endDate, endTime, totalPrice, tax, serviceFee, finalTotal];
        connection.query(insertBookingQuery, bookingValues, (err) => {
          if (err) return connection.rollback(() => res.status(500).send(err));

          // Step 4: Commit transaction and redirect
          connection.commit((err) => {
            if (err) return connection.rollback(() => res.status(500).send(err));
            res.json(bookingId);
          });
        });
      });
    });
  });
});

app.post('/checkbooking', (req, res) => {
  const { bookingNumber, phoneNumber } = req.body;

  // Start a transaction
  connection.beginTransaction((err) => {
    if (err) return res.status(500).send(err);

    // Step 1: Retrieve booking details
    const getBookingQuery = `
      SELECT * FROM bookings WHERE id = ? AND phone_number = ?
    `;
    connection.query(getBookingQuery, [bookingNumber, phoneNumber], (err, results) => {
      if (err) return connection.rollback(() => res.status(500).send(err));

      if (results.length === 0) {
        // No booking found
        return connection.rollback(() => res.status(404).json({
          success: false,
          message: 'No booking found for the provided details.'
        }));
      }

      const booking = results[0];

      // Step 2: Retrieve car details
      const getCarQuery = 'SELECT * FROM cars WHERE id = ?';
      connection.query(getCarQuery, [booking.car_id], (err, carResults) => {
        if (err) return connection.rollback(() => res.status(500).send(err));

        if (carResults.length === 0) {
          // No car found
          return connection.rollback(() => res.status(404).json({
            success: false,
            message: 'Car details not found.'
          }));
        }

        const car = carResults[0];

        // Commit the transaction (though it's a read-only transaction)
        connection.commit((err) => {
          if (err) return connection.rollback(() => res.status(500).send(err));

          // Send back booking and car details
          res.json({
            success: true,
            booking,
            car
          });
        });
      });
    });
  });
});


// Leave a review for a car
app.post('/reviews', (req, res) => {
  const { carId, userId, review, rating } = req.body;
  const query = 'INSERT INTO reviews (carId, userId, review, rating) VALUES (?, ?, ?, ?)';
  connection.query(query, [carId, userId, review, rating], (err, result) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.status(201).send('Review added');
  });
});

// Get reviews for a car
app.get('/reviews/:carId', (req, res) => {
  const { carId } = req.params;
  const query = 'SELECT * FROM reviews WHERE carId = ?';
  connection.query(query, [carId], (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results);
  });
});

// User registration
app.post('/users', (req, res) => {
  const { name, email, phoneNumber, password } = req.body;
  const query = 'INSERT INTO users (name, email, phoneNumber, password) VALUES (?, ?, ?, ?)';
  connection.query(query, [name, email, phoneNumber, password], (err, result) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.status(201).send('User registered');
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});