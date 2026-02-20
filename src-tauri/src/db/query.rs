use anyhow::Result;
use serde::Serialize;
use std::sync::Arc;
use std::time::Instant;
use tokio_postgres::types::Type;
use tokio_postgres::Client;

#[derive(Debug, Serialize)]
pub struct QueryResult {
    pub columns: Vec<ColumnDef>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub execution_time_ms: u128,
    pub command_tag: String,
}

#[derive(Debug, Serialize)]
pub struct ColumnDef {
    pub name: String,
    pub data_type: String,
}

pub async fn execute_query(client: &Arc<Client>, sql: &str) -> Result<QueryResult> {
    let start = Instant::now();

    let stmt = client.prepare(sql).await?;
    let rows = client.query(&stmt, &[]).await?;
    let execution_time_ms = start.elapsed().as_millis();

    let columns: Vec<ColumnDef> = stmt
        .columns()
        .iter()
        .map(|col| ColumnDef {
            name: col.name().to_string(),
            data_type: pg_type_to_string(col.type_()),
        })
        .collect();

    let mut result_rows = Vec::with_capacity(rows.len());

    for row in &rows {
        let mut values = Vec::with_capacity(columns.len());
        for (i, col) in stmt.columns().iter().enumerate() {
            let value = pg_value_to_json(&row, i, col.type_());
            values.push(value);
        }
        result_rows.push(values);
    }

    let row_count = result_rows.len();

    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        execution_time_ms,
        command_tag: format!("SELECT {}", row_count),
    })
}

fn pg_type_to_string(pg_type: &Type) -> String {
    match *pg_type {
        Type::BOOL => "boolean".into(),
        Type::INT2 => "smallint".into(),
        Type::INT4 => "integer".into(),
        Type::INT8 => "bigint".into(),
        Type::FLOAT4 => "real".into(),
        Type::FLOAT8 => "double precision".into(),
        Type::NUMERIC => "numeric".into(),
        Type::VARCHAR => "varchar".into(),
        Type::TEXT => "text".into(),
        Type::BPCHAR => "char".into(),
        Type::TIMESTAMP => "timestamp".into(),
        Type::TIMESTAMPTZ => "timestamptz".into(),
        Type::DATE => "date".into(),
        Type::TIME => "time".into(),
        Type::UUID => "uuid".into(),
        Type::JSON => "json".into(),
        Type::JSONB => "jsonb".into(),
        Type::BYTEA => "bytea".into(),
        _ => pg_type.name().to_string(),
    }
}

fn pg_value_to_json(
    row: &tokio_postgres::Row,
    idx: usize,
    pg_type: &Type,
) -> serde_json::Value {
    // Try to extract based on type, fallback to text representation
    match *pg_type {
        Type::BOOL => row
            .try_get::<_, Option<bool>>(idx)
            .ok()
            .flatten()
            .map(serde_json::Value::Bool)
            .unwrap_or(serde_json::Value::Null),
        Type::INT2 => row
            .try_get::<_, Option<i16>>(idx)
            .ok()
            .flatten()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null),
        Type::INT4 => row
            .try_get::<_, Option<i32>>(idx)
            .ok()
            .flatten()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null),
        Type::INT8 => row
            .try_get::<_, Option<i64>>(idx)
            .ok()
            .flatten()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null),
        Type::FLOAT4 => row
            .try_get::<_, Option<f32>>(idx)
            .ok()
            .flatten()
            .and_then(|v| serde_json::Number::from_f64(v as f64))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Type::FLOAT8 => row
            .try_get::<_, Option<f64>>(idx)
            .ok()
            .flatten()
            .and_then(|v| serde_json::Number::from_f64(v))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Type::JSON | Type::JSONB => row
            .try_get::<_, Option<serde_json::Value>>(idx)
            .ok()
            .flatten()
            .unwrap_or(serde_json::Value::Null),
        _ => {
            // Fallback: try to get as string
            row.try_get::<_, Option<String>>(idx)
                .ok()
                .flatten()
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null)
        }
    }
}
