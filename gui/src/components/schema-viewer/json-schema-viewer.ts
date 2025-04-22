import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../common/fa-icon";
// Lazy load components
const SchemaSection = () => import("./schema-section");
const CodePreview = () => import("./code-preview");
import { formatDistanceToNow } from 'date-fns';

interface JsonSchema {
  $schema?: string;
  $defs?: Record<
    string,
    {
      title: string;
      description?: string;
      fa_icon?: string;
      properties: Record<string, any>;
      required?: string[];
    }
  >;
  allOf?: Array<{ $ref: string }>;
  title?: string;
  description?: string;
}

interface ApiResponse<T = any> {
  status: "success" | "error";
  message?: string;
  type?: string;
  data?: T;
}

@customElement("json-schema-viewer")
export class JsonSchemaViewer extends LitElement {
  @state() private schema: JsonSchema = { $defs: {} };
  @state() private serverStatus: 'connected' | 'disconnected' = 'disconnected';
  @state() private lastSaveStatus: 'success' | 'error' | null = null;
  @state() private lastSaveTime: Date | null = null;
  private healthCheckInterval: number | null = null;

  // Default to localhost:5173 if we're in development
  private baseUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:5173'
    : `http://${window.location.host}`;

  async connectedCallback() {
    super.connectedCallback();
    // Preload components
    await Promise.all([
      SchemaSection(),
      CodePreview()
    ]);
    console.log('Connecting to server at:', this.baseUrl);
    await this.startHealthCheck();
    if (this.serverStatus === 'connected') {
      await this.fetchSchema();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.healthCheckInterval) {
      window.clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async startHealthCheck() {
    // Check health immediately
    await this.checkHealth();

    // Then check every 5 seconds
    this.healthCheckInterval = window.setInterval(async () => {
      await this.checkHealth();
      // If we're connected but don't have a schema, try to fetch it
      if (this.serverStatus === 'connected' && !this.schema.$defs) {
        await this.fetchSchema();
      }
    }, 5000);
  }

  private async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`);
      if (response.ok) {
        this.serverStatus = 'connected';
      } else {
        console.warn('Health check failed with status:', response.status);
        this.serverStatus = 'disconnected';
      }
    } catch (error) {
      console.error("Health check failed:", error);
      this.serverStatus = 'disconnected';
    }
  }

  private async fetchSchema() {
    try {
      console.log('Fetching schema from:', `${this.baseUrl}/api/schema`);
      const response = await fetch(`${this.baseUrl}/api/schema`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: ApiResponse<JsonSchema> = await response.json();
      console.log('Received schema response:', data);

      if (data.status === "success" && data.data) {
        console.log('Setting schema to:', data.data);
        // Ensure we have a valid schema structure
        this.schema = {
          $defs: data.data.$defs || {},
          ...data.data
        };
        console.log('Schema after update:', this.schema);
        this.requestUpdate();
      } else {
        console.warn('Received invalid schema data:', data);
      }
    } catch (error) {
      console.error('Error fetching schema:', error);
    }
  }

  private async handleSave() {
    try {
      console.log('Saving schema:', this.schema);
      const response = await fetch(`${this.baseUrl}/api/schema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.schema),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = await response.json();
      console.log('Save response:', data);

      if (data.status === "success") {
        this.lastSaveStatus = 'success';
        this.lastSaveTime = new Date();
        console.log("Schema saved successfully");
        // Refresh the schema to ensure we have the latest version
        await this.fetchSchema();
      } else {
        throw new Error(data.message || "Unknown error");
      }

      return data;
    } catch (error) {
      this.lastSaveStatus = 'error';
      console.error("Failed to save schema:", error);
      throw error;
    }
  }

  private async handleFinish() {
    try {
      // Save one last time before finishing
      await this.handleSave();

      console.log('Sending finish command to:', `${this.baseUrl}/api/finish`);
      const response = await fetch(`${this.baseUrl}/api/finish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = await response.json();
      if (data.status === "success") {
        console.log("Finished successfully");
        // Close the window
        window.close();
      } else {
        throw new Error(data.message || "Unknown error");
      }
    } catch (error) {
      console.error("Error during finish:", error);
      // Show error to user
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to finish: ${errorMessage}`);
    }
  }

  private async handleSchemaUpdate(name: string, section: any) {
    try {
      // Create a clean copy of the current schema to avoid reference issues
      const currentSchema = JSON.parse(JSON.stringify(this.schema));

      // Find the original key in $defs that matches this section
      const originalKey = Object.keys(currentSchema.$defs || {}).find(key => {
        const def = currentSchema.$defs?.[key];
        return def.title === name || key === name.toLowerCase().replace(/\s+/g, '_');
      });

      if (!originalKey) {
        console.error(`Could not find original key for section ${name}`);
        return;
      }

      console.log(`Found original key: ${originalKey} for section ${name}`);

      // Create the updated schema using the original key
      const updatedSchema = {
        ...currentSchema,
        $defs: {
          ...currentSchema.$defs,
          [originalKey]: {
            ...section,
            title: name // Preserve the original title
          }
        },
      };

      // Update the local state
      this.schema = updatedSchema;

      // Request an update
      this.requestUpdate();

      // Auto-save on every change
      await this.handleSave();
    } catch (error) {
      console.error('Error updating schema:', error);
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    .schema-builder {
      display: grid;
      grid-template-columns: 250px 1fr;
      gap: 2rem;
      height: 100vh;
    }

    .sidebar {
      background: var(--background-dark);
      padding: 1.5rem;
      border-right: 1px solid var(--border-color);
    }

    .header {
      margin-bottom: 2rem;
    }

    .header h1 {
      margin: 0 0 0.5rem 0;
      font-size: 1.5rem;
      color: var(--text-color);
    }

    .header p {
      margin: 0;
      color: var(--text-muted);
    }

    .actions {
      display: grid;
      gap: 1rem;
    }

    .actions button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      transition: opacity 0.3s;
    }

    .save-button {
      background: var(--success-color);
      color: white;
    }

    .finish-button {
      background: var(--primary-color);
      color: white;
    }

    button:hover {
      opacity: 0.9;
    }

    .main-content {
      padding: 1.5rem;
      overflow-y: auto;
    }

    .server-status {
      margin-bottom: 1rem;
      padding: 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .server-status.connected {
      background-color: rgb(from var(--success-color) r g b / 0.5);
      color: var(--text-color);
    }

    .server-status.disconnected {
      background-color: rgb(from var(--error-color) r g b / 0.5);
      color: var(--text-color);
    }

    .save-status {
      font-size: 0.8rem;
      margin-top: 0.25rem;
      text-align: center;
    }

    .save-status.success {
      color: var(--success-color);
    }

    .save-status.error {
      color: var(--error-color);
    }

    .text-muted {
      color: var(--text-muted);
    }

    .text-centered {
      text-align: center;
    }

    fa-icon {
      font-size: 1em;
    }
  `;

  render() {
    return html`
      <div class="schema-builder">
        <nav class="sidebar">
          <div class="header">
            <h1>Schema Builder</h1>
            <p>Build your pipeline parameter schema</p>
          </div>

          <div class="server-status ${this.serverStatus}">
            <fa-icon
              icon=${this.serverStatus === "connected" ? "fas check-circle" : "fas exclamation-circle"}
            ></fa-icon>
            ${this.serverStatus === "connected" ? "Connected" : "Disconnected"}
          </div>

          <div class="actions">
            <button class="save-button" @click=${this.handleSave}>
              <fa-icon icon="fas fa-save"></fa-icon>
              Save Schema
            </button>
            ${this.lastSaveStatus
              ? html`
                  <div class="save-status ${this.lastSaveStatus}">
                    ${this.lastSaveStatus === "success" ? "Saved successfully" : "Save failed"}
                  </div>
                `
              : ""}
            ${this.lastSaveTime
              ? html`
                  <small class="save-time text-muted text-centered">
                    ${formatDistanceToNow(this.lastSaveTime, { addSuffix: true })}
                  </small>
                `
              : ""}
            <button class="finish-button" @click=${this.handleFinish}>
              <fa-icon icon="fas fa-check-circle"></fa-icon>
              Finish
            </button>
          </div>
        </nav>

        <main class="main-content">
          ${Object.entries(this.schema.$defs || {}).map(([name, def]) => {
            return html`
              <div class="schema-section">
                <schema-section
                  .name=${def.title}
                  .description=${def.description || ""}
                  .icon=${def.fa_icon || ""}
                  .section=${def}
                  @section-update=${(e: CustomEvent) => this.handleSchemaUpdate(e.detail.name, e.detail.section)}
                ></schema-section>
              </div>
            `;
          })}
          <code-preview .data=${this.schema}></code-preview>
        </main>
      </div>
    `;
  }
}
