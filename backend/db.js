const sql = require("mssql");

let pool;

async function connectDB(config) {
  pool = await sql.connect(config);
  console.log("✅ SQL Server IGSMasanDB connected");
}

function getPool() {
  if (!pool) throw new Error("DB not connected");
  return pool;
}

module.exports = { connectDB, getPool, sql };
