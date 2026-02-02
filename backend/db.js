const sql = require("mssql");

let pool;

async function connectDB(config) {
  try {
    pool = await sql.connect(config);
    console.log("✅ SQL Server IGSMasanDB connected");
  } catch (err) {
    console.error("❌ SQL Server connection failed:", err.message);
    throw err;
  }
}

function getPool() {
  if (!pool) throw new Error("DB not connected");
  return pool;
}

module.exports = { connectDB, getPool, sql };
