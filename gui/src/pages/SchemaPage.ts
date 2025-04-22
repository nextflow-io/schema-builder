import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

interface Schema {
  title?: string;
  properties?: Record<string, any>;
}

interface ApiResponse<T = any> {
  status: "success" | "error";
  message?: string;
  type?: string;
  data?: T;
}

@customElement('schema-page')
class SchemaPage extends LitElement {
  @state()
  private schema: Schema | null = null;

  @state()
  private serverStatus: 'connected' | 'disconnected' = 'disconnected';

  private baseUrl = `http://${window.location.host}`;
  private healthCheckInterval: number | null = null;

  static styles = css`
    :host {
      display: block;
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .upload-area {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      margin-bottom: 20px;
      cursor: pointer;
      transition: border-color 0.3s;
    }

    .upload-area:hover {
      border-color: #666;
    }

    .upload-button {
      background-color: #4CAF50;
      color: white;
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }

    .server-status {
      margin-bottom: 20px;
      padding: 10px;
      border-radius: 4px;
    }

    .server-status.connected {
      background-color: #dff0d8;
      color: #3c763d;
    }

    .server-status.disconnected {
      background-color: #f2dede;
      color: #a94442;
    }

    .schema-content {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .property {
      margin: 10px 0;
      padding: 10px;
      border-left: 3px solid #4CAF50;
    }

    .property-name {
      font-weight: bold;
      margin-right: 10px;
    }

    .property-type {
      color: #666;
      font-style: italic;
    }

    .property-description {
      margin-top: 5px;
      color: #555;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.startHealthCheck();
    this.fetchSchema();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.healthCheckInterval) {
      window.clearInterval(this.healthCheckInterval);
    }
  }

  private startHealthCheck() {
    // Check health immediately
    this.checkHealth();

    // Then check every 5 seconds
    this.healthCheckInterval = window.setInterval(() => {
      this.checkHealth();
    }, 5000);
  }

  private async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`);
      if (response.ok) {
        this.serverStatus = 'connected';
      } else {
        this.serverStatus = 'disconnected';
      }
    } catch (error) {
      console.error("Health check failed:", error);
      this.serverStatus = 'disconnected';
    }
  }

  private async fetchSchema() {
    try {
      const response = await fetch(`${this.baseUrl}/api/schema`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: ApiResponse<Schema> = await response.json();
      if (data.type === "schema_update" && data.data) {
        this.schema = data.data;
      }
    } catch (error) {
      console.error('Error fetching schema:', error);
    }
  }

  private async handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const schema = await this.readFileAsJson(file);
      await this.saveSchema(schema);
      this.schema = schema;
    } catch (error) {
      console.error('Error uploading schema:', error);
    }
  }

  private readFileAsJson(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          resolve(json);
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Error reading file'));
      reader.readAsText(file);
    });
  }

  private async saveSchema(schema: Schema) {
    try {
      const response = await fetch(`${this.baseUrl}/api/schema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(schema),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = await response.json();
      if (data.status === "success") {
        console.log("Schema saved successfully");
      } else {
        throw new Error(data.message || "Unknown error");
      }
    } catch (error) {
      console.error('Error saving schema:', error);
      throw error;
    }
  }

  private renderProperty(name: string, details: any) {
    return html`
      <div class="property">
        <span class="property-name">${name}</span>
        <span class="property-type">${details.type}</span>
        ${details.description
          ? html`<div class="property-description">${details.description}</div>`
          : ''}
      </div>
    `;
  }

  render(): ReturnType<typeof html> {
    return html`
      <div class="schema-page">
        <div class="server-status ${this.serverStatus}">
          Server Status: ${this.serverStatus}
        </div>

        <div class="upload-area" @click=${() => this.shadowRoot?.querySelector('input')?.click()}>
          <input
            type="file"
            accept=".json"
            @change=${this.handleFileUpload}
            style="display: none"
          />
          <button class="upload-button">
            <i class="fas fa-upload"></i>
            Upload JSON Schema file
          </button>
          <p>or drag and drop a file here</p>
        </div>

        ${this.schema
          ? html`
              <div class="schema-content">
                <h2>${this.schema.title || 'Schema Properties'}</h2>
                ${this.schema.properties
                  ? Object.entries(this.schema.properties).map(([name, details]) =>
                      this.renderProperty(name, details)
                    )
                  : 'No properties found'}
              </div>
              <pre>
                <code>
                  ${JSON.stringify(this.schema, null, 2)}
                </code>
              </pre>
            `
          : ''}
      </div>
    `;
  }
}
