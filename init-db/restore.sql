RESTORE DATABASE IGS
FROM DISK = '/var/opt/mssql/backup/IGS-260116.bak'
WITH
MOVE 'IGS' TO '/var/opt/mssql/data/IGS.mdf',
MOVE 'IGS_log' TO '/var/opt/mssql/data/IGS_log.ldf',
REPLACE;
GO
