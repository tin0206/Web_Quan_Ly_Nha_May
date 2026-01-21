#!/bin/bash
set -e

echo "⏳ Đợi SQL Server sẵn sàng..."

until /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" > /dev/null 2>&1
do
  sleep 2
done

echo "✅ SQL Server đã sẵn sàng"

echo "🔄 Kiểm tra database..."
DB_EXISTS=$(/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT name FROM sys.databases WHERE name='IGSMasanDB'" -h -1 | tr -d ' ')

if [ "$DB_EXISTS" = "IGSMasanDB" ]; then
  echo "✅ Database đã tồn tại, bỏ qua restore"
  exit 0
fi

echo "📦 Đang restore database..."

 /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "
RESTORE DATABASE [IGSMasanDB]
FROM DISK = '/var/opt/mssql/backup/IGS-260116.bak'
WITH MOVE 'IGSMasanDB' TO '/var/opt/mssql/data/IGSMasanDB.mdf',
     MOVE 'IGSMasanDB_log' TO '/var/opt/mssql/data/IGSMasanDB_log.ldf',
     REPLACE
"

echo "🎉 Restore database thành công"
