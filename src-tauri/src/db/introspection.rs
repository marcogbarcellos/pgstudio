use anyhow::Result;
use serde::Serialize;
use std::sync::Arc;
use tokio_postgres::Client;

#[derive(Debug, Serialize)]
pub struct SchemaInfo {
    pub name: String,
    pub owner: String,
}

#[derive(Debug, Serialize)]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
    pub table_type: String, // "BASE TABLE" or "VIEW"
    pub row_estimate: i64,
    pub size: String,
}

#[derive(Debug, Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_default: Option<String>,
    pub is_primary_key: bool,
    pub is_foreign_key: bool,
    pub foreign_table: Option<String>,
    pub foreign_column: Option<String>,
    pub ordinal_position: i32,
}

pub async fn get_schemas(client: &Arc<Client>) -> Result<Vec<SchemaInfo>> {
    let rows = client
        .query(
            "SELECT schema_name, schema_owner
             FROM information_schema.schemata
             WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
             ORDER BY schema_name",
            &[],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| SchemaInfo {
            name: row.get(0),
            owner: row.get(1),
        })
        .collect())
}

pub async fn get_tables(client: &Arc<Client>, schema: &str) -> Result<Vec<TableInfo>> {
    let rows = client
        .query(
            "SELECT
                t.table_schema,
                t.table_name,
                t.table_type,
                COALESCE(c.reltuples::bigint, 0) as row_estimate,
                COALESCE(pg_size_pretty(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))), '0 bytes') as size
             FROM information_schema.tables t
             LEFT JOIN pg_class c ON c.relname = t.table_name
             LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
             WHERE t.table_schema = $1
             ORDER BY t.table_name",
            &[&schema],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| TableInfo {
            schema: row.get(0),
            name: row.get(1),
            table_type: row.get(2),
            row_estimate: row.get(3),
            size: row.get(4),
        })
        .collect())
}

pub async fn get_columns(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<ColumnInfo>> {
    let rows = client
        .query(
            "SELECT
                c.column_name,
                c.data_type,
                c.is_nullable = 'YES' as is_nullable,
                c.column_default,
                COALESCE(pk.is_pk, false) as is_primary_key,
                COALESCE(fk.is_fk, false) as is_foreign_key,
                fk.foreign_table,
                fk.foreign_column,
                c.ordinal_position::int
             FROM information_schema.columns c
             LEFT JOIN (
                SELECT kcu.column_name, true as is_pk
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = $1
                    AND tc.table_name = $2
             ) pk ON pk.column_name = c.column_name
             LEFT JOIN (
                SELECT
                    kcu.column_name,
                    true as is_fk,
                    ccu.table_name as foreign_table,
                    ccu.column_name as foreign_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = $1
                    AND tc.table_name = $2
             ) fk ON fk.column_name = c.column_name
             WHERE c.table_schema = $1 AND c.table_name = $2
             ORDER BY c.ordinal_position",
            &[&schema, &table],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| ColumnInfo {
            name: row.get(0),
            data_type: row.get(1),
            is_nullable: row.get(2),
            column_default: row.get(3),
            is_primary_key: row.get(4),
            is_foreign_key: row.get(5),
            foreign_table: row.get(6),
            foreign_column: row.get(7),
            ordinal_position: row.get(8),
        })
        .collect())
}
