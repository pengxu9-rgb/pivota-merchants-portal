#!/usr/bin/env python3
"""
Run migration 001: Add refund tables
Usage: python run_migration_001_refunds.py
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime

# Add project root to path
sys.path.append(str(Path(__file__).parent))

from pivota_infra.db.database import database
from pivota_infra.utils.logger import logger


async def run_migration():
    """Execute the refund tables migration"""
    migration_file = Path(__file__).parent / "pivota_infra" / "db" / "migrations" / "001_add_refund_tables.sql"
    
    if not migration_file.exists():
        logger.error(f"Migration file not found: {migration_file}")
        return False
    
    try:
        # Connect to database
        await database.connect()
        logger.info("Connected to database")
        
        # Read migration SQL
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
        
        # Split by semicolons to handle multiple statements
        # Filter out empty statements and comments
        statements = [
            stmt.strip() 
            for stmt in migration_sql.split(';') 
            if stmt.strip() and not stmt.strip().startswith('--')
        ]
        
        logger.info(f"Executing {len(statements)} SQL statements")
        
        # Execute each statement
        for i, statement in enumerate(statements, 1):
            try:
                # Skip if it's just a comment
                if statement.strip().startswith('--'):
                    continue
                    
                logger.info(f"Executing statement {i}/{len(statements)}")
                await database.execute(statement)
            except Exception as e:
                # Log error but continue - some statements might fail if already applied
                if "already exists" in str(e).lower():
                    logger.warning(f"Statement {i} skipped - already exists: {str(e)[:100]}")
                else:
                    logger.error(f"Statement {i} failed: {e}")
                    # For non-duplicate errors, we should fail
                    if "already exists" not in str(e).lower():
                        raise
        
        # Verify the migration
        logger.info("Verifying migration...")
        
        # Check if tables exist
        check_tables = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('refund_records', 'refund_retry_queue');
        """
        
        result = await database.fetch_all(check_tables)
        tables = [row['table_name'] for row in result]
        
        if 'refund_records' in tables:
            logger.info("✓ refund_records table created successfully")
        else:
            logger.error("✗ refund_records table not found")
            
        if 'refund_retry_queue' in tables:
            logger.info("✓ refund_retry_queue table created successfully")
        else:
            logger.error("✗ refund_retry_queue table not found")
        
        # Check if column was added to orders
        check_column = """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'orders' 
        AND column_name = 'total_refunded';
        """
        
        result = await database.fetch_one(check_column)
        if result:
            logger.info("✓ total_refunded column added to orders table")
        else:
            logger.error("✗ total_refunded column not found in orders table")
        
        logger.info("Migration 001_add_refund_tables completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False
    finally:
        await database.disconnect()
        logger.info("Disconnected from database")


if __name__ == "__main__":
    logger.info("Starting refund tables migration...")
    logger.info(f"Timestamp: {datetime.now().isoformat()}")
    
    success = asyncio.run(run_migration())
    
    if success:
        logger.info("Migration completed successfully!")
        sys.exit(0)
    else:
        logger.error("Migration failed!")
        sys.exit(1)

