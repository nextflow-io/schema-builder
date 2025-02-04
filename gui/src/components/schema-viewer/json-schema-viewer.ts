import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../common/fa-icon";
import "./schema-section";
import "./code-preview";

interface JsonSchema {
  $schema?: string;
  $defs?: Record<
    string,
    {
      title?: string;
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

@customElement("json-schema-viewer")
export class JsonSchemaViewer extends LitElement {
  @state() private schema: JsonSchema = { $defs: {} };
  @state() private wsStatus: 'connected' | 'disconnected' = 'disconnected';
  @state() private lastSaveStatus: 'success' | 'error' | null = null;
  private ws: WebSocket | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.connectWebSocket();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.ws) {
      this.ws.close();
    }
  }

  private connectWebSocket() {
    const wsUrl = `ws://localhost:5173/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.wsStatus = "connected";
      // Request the current schema when connected
      if (this.ws) {
        this.ws.send(
          JSON.stringify({
            type: "get_schema",
          })
        );
      }
    };

    this.ws.onclose = () => {
      this.wsStatus = "disconnected";
      // Try to reconnect after 5 seconds
      setTimeout(() => this.connectWebSocket(), 5000);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "schema_update") {
          this.schema = message.data;
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.wsStatus = "disconnected";
    };
  }

  private async handleSave() {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.ws = new WebSocket("ws://localhost:5173/ws");
        await new Promise((resolve, reject) => {
          if (!this.ws) return reject(new Error('No WebSocket'));
          this.ws.onopen = resolve;
          this.ws.onerror = reject;
        });
      }

      this.ws.send(
        JSON.stringify({
          type: "save_schema",
          data: this.schema,
        })
      );

      return new Promise((resolve, reject) => {
        if (!this.ws) return reject(new Error('No WebSocket'));

        const handler = (event: MessageEvent) => {
          const response = JSON.parse(event.data);
          if (response.status === "success") {
            this.lastSaveStatus = 'success';
            console.log("Schema saved successfully");
            resolve(response);
          } else {
            this.lastSaveStatus = 'error';
            console.error("Failed to save schema:", response.message);
            reject(new Error(response.message));
          }
        };

        this.ws.onmessage = handler;
        this.ws.onerror = reject;
      });
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

      // Send finish command
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "finish" }));
        this.ws.close();
      }
    } catch (error) {
      console.error("Error during finish:", error);
    }
  }

  private async handleSchemaUpdate(name: string, section: any) {
    this.schema = {
      ...this.schema,
      $defs: {
        ...this.schema.$defs,
        [name]: section,
      },
    };

    // Auto-save on every change
    try {
      await this.handleSave();
    } catch (error) {
      // Error is already logged in handleSave
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

    .ws-status {
      margin-bottom: 1rem;
      padding: 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .ws-status.connected {
      background-color: rgb(from var(--success-color) r g b / 0.5);
      color: var(--text-color);
    }

    .ws-status.disconnected {
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

          <div class="ws-status ${this.wsStatus}">
            <fa-icon icon=${this.wsStatus === "connected" ? "fas check-circle" : "fas exclamation-circle"}></fa-icon>
            ${this.wsStatus === "connected" ? "Connected" : "Disconnected"}
          </div>

          <div class="actions">
            <button class="save-button" @click=${this.handleSave}>
              <fa-icon icon="fas fa-save"></fa-icon>
              Save Schema
            </button>
            ${this.lastSaveStatus ? html`
              <div class="save-status ${this.lastSaveStatus}">
                ${this.lastSaveStatus === 'success' ? 'Saved successfully' : 'Save failed'}
              </div>
            ` : ''}
            <button class="finish-button" @click=${this.handleFinish}>
              <fa-icon icon="fas fa-check-circle"></fa-icon>
              Finish
            </button>
          </div>
        </nav>

        <main class="main-content">
          ${Object.entries(this.schema.$defs || {}).map(
            ([name, def]) => {
              return html`
                <div class="schema-section">
                  <schema-section
                    .name=${def.title}
                    .description=${def.description}
                    .icon=${def.fa_icon}
                    .section=${def}
                    @section-update=${(e: CustomEvent) => this.handleSchemaUpdate(e.detail.name, e.detail.section)}
                  ></schema-section>
                </div>
              `;
            }
          )}
          <code-preview .data=${this.schema}></code-preview>
        </main>
      </div>
    `;
  }
}
