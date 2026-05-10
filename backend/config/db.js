const { Pool } = require('pg');

const connectDB = async () => {
  try {
    const sslMode = process.env.DATABASE_SSL || (
      process.env.NODE_ENV === 'production' ? 'require' : 'disable'
    );
    const ssl =
      sslMode === 'disable'
        ? false
        : { rejectUnauthorized: sslMode !== 'no-verify' };

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl,
      connectionTimeoutMillis: 10000,
    });

    const client = await pool.connect();
    client.release();

    console.log('PostgreSQL connected successfully');
    return pool;
  } catch (err) {
    console.error('PostgreSQL connection error:', err.message);
    process.exit(1); 
  }
};

module.exports = connectDB;
