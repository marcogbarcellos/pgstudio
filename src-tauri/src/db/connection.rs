use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_postgres::{Client, NoTls};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    /// Password is stored separately in local database, not serialized
    #[serde(skip)]
    pub password: String,
    pub ssl_mode: SslMode,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SslMode {
    #[default]
    Prefer,
    Require,
    Disable,
}

/// Manages active database connections
pub struct ConnectionManager {
    connections: RwLock<HashMap<String, Arc<Client>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
        }
    }

    pub async fn connect(&self, config: &ConnectionConfig) -> Result<()> {
        let conn_string = format!(
            "host={} port={} dbname={} user={} password={}",
            config.host, config.port, config.database, config.user, config.password
        );

        let (client, connection) = tokio_postgres::connect(&conn_string, NoTls).await?;

        // Spawn the connection handler
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("Connection error: {}", e);
            }
        });

        let mut connections = self.connections.write().await;
        connections.insert(config.id.clone(), Arc::new(client));

        Ok(())
    }

    pub async fn disconnect(&self, connection_id: &str) -> Result<()> {
        let mut connections = self.connections.write().await;
        connections.remove(connection_id);
        Ok(())
    }

    pub async fn get_client(&self, connection_id: &str) -> Result<Arc<Client>> {
        let connections = self.connections.read().await;
        connections
            .get(connection_id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("No active connection with id: {}", connection_id))
    }

    pub async fn test_connection(config: &ConnectionConfig) -> Result<String> {
        let conn_string = format!(
            "host={} port={} dbname={} user={} password={}",
            config.host, config.port, config.database, config.user, config.password
        );

        let (client, connection) = tokio_postgres::connect(&conn_string, NoTls).await?;

        tokio::spawn(async move {
            let _ = connection.await;
        });

        let row = client.query_one("SELECT version()", &[]).await?;
        let version: String = row.get(0);

        Ok(version)
    }
}
