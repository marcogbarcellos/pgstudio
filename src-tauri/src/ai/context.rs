use serde::{Deserialize, Serialize};

/// Schema context sent to AI — never contains actual row data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaContext {
    pub tables: Vec<TableContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableContext {
    pub schema: String,
    pub name: String,
    pub columns: Vec<ColumnContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnContext {
    pub name: String,
    pub data_type: String,
    pub is_primary_key: bool,
    pub is_foreign_key: bool,
    pub foreign_ref: Option<String>,
}

impl SchemaContext {
    pub fn to_ddl_summary(&self) -> String {
        let mut out = String::new();
        for table in &self.tables {
            out.push_str(&format!("-- {}.{}\n", table.schema, table.name));
            out.push_str(&format!(
                "CREATE TABLE {}.{} (\n",
                table.schema, table.name
            ));
            for (i, col) in table.columns.iter().enumerate() {
                let mut parts = vec![format!("  {} {}", col.name, col.data_type)];
                if col.is_primary_key {
                    parts.push("PRIMARY KEY".into());
                }
                if col.is_foreign_key {
                    if let Some(ref fk) = col.foreign_ref {
                        parts.push(format!("REFERENCES {}", fk));
                    }
                }
                let suffix = if i < table.columns.len() - 1 {
                    ","
                } else {
                    ""
                };
                out.push_str(&format!("{}{}\n", parts.join(" "), suffix));
            }
            out.push_str(");\n\n");
        }
        out
    }
}
