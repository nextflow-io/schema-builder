import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

interface SchemaProperty {
  type: string;
  description?: string;
  properties?: Record<string, SchemaProperty>;
}

interface Schema {
  title?: string;
  properties?: Record<string, SchemaProperty>;
}

export @customElement('schema-page')
class SchemaPage extends LitElement {
  @state()
  private schema: Schema | null = null;

  @state()
  private wsStatus: 'connected' | 'disconnected' = 'disconnected';

  private ws: WebSocket | null = null;

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

    .ws-status {
      margin-bottom: 20px;
      padding: 10px;
      border-radius: 4px;
    }

    .ws-status.connected {
      background-color: #dff0d8;
      color: #3c763d;
    }

    .ws-status.disconnected {
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
    this.connectWebSocket();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.ws) {
      this.ws.close();
    }
  }

  private connectWebSocket() {
    const wsUrl = `ws://${window.location.host}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.wsStatus = 'connected';
    };

    this.ws.onclose = () => {
      this.wsStatus = 'disconnected';
      // Try to reconnect after 5 seconds
      setTimeout(() => this.connectWebSocket(), 5000);
    };

    this.ws.onmessage = (event) => {
      try {
        this.schema = JSON.parse(event.data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }

  private handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const result = e.target?.result;
          if (typeof result === 'string') {
            this.schema = JSON.parse(result);
          }
        } catch (error) {
          console.error('Error parsing JSON:', error);
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  }

  private renderProperty(name: string, details: SchemaProperty, level = 0): ReturnType<typeof html> {
    return html`
      <div class="property" style="margin-left: ${level * 20}px">
        <span class="property-name">${name}</span>
        <span class="property-type">${details.type}</span>
        ${details.description
          ? html`<div class="property-description">${details.description}</div>`
          : ''}
        ${details.properties
          ? Object.entries(details.properties).map(([propName, propDetails]) =>
              this.renderProperty(propName, propDetails, level + 1)
            )
          : ''}
      </div>
    `;
  }

  render(): ReturnType<typeof html> {
    return html`
      <div class="schema-page">
        <div class="ws-status ${this.wsStatus}">
          WebSocket Status: ${this.wsStatus}
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
                  ${JSON.stringify(this.schema)}
                </code>
              </pre>
            `
          : ''}
      </div>
    `;
  }
}
