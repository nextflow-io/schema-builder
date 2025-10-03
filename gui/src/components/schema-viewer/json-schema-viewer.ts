import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../common/fa-icon";
// Lazy load components
const SchemaSection = () => import("./schema-section");
const CodePreview = () => import("./code-preview");
import { formatDistanceToNow } from "date-fns";

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

interface SchemaDef {
  title: string;
  description?: string;
  fa_icon?: string;
  properties: Record<string, any>;
  required?: string[];
}

@customElement("json-schema-viewer")
export class JsonSchemaViewer extends LitElement {
  @state() private schema: JsonSchema = { $defs: {} };
  @state() private serverStatus: "connected" | "disconnected" = "disconnected";
  @state() private lastSaveStatus: "success" | "error" | null = null;
  @state() private lastSaveTime: Date | null = null;
  private healthCheckInterval: number | null = null;
  private isUsingDummySchema = false;

  // Default to localhost:5173 if we're in development
  private baseUrl =
    window.location.hostname === "localhost"
      ? "http://localhost:5173"
      : `http://${window.location.host}`;

  async connectedCallback() {
    super.connectedCallback();
    // Preload components
    await Promise.all([SchemaSection(), CodePreview()]);
    console.log("Connecting to server at:", this.baseUrl);
    await this.startHealthCheck();
    if (this.serverStatus === "connected") {
      await this.fetchSchema();
    } else {
      // Load dummy schema when not connected to backend
      this.loadDummySchema();
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
      // If we're connected but don't have a schema or using dummy schema, try to fetch it
      if (
        this.serverStatus === "connected" &&
        (!this.schema.$defs || this.isUsingDummySchema)
      ) {
        await this.fetchSchema();
      }
    }, 5000);
  }

  private async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`);
      if (response.ok) {
        this.serverStatus = "connected";
      } else {
        console.warn("Health check failed with status:", response.status);
        this.serverStatus = "disconnected";
      }
    } catch (error) {
      console.error("Health check failed:", error);
      this.serverStatus = "disconnected";
    }
  }

  private async fetchSchema() {
    try {
      console.log("Fetching schema from:", `${this.baseUrl}/api/schema`);
      const response = await fetch(`${this.baseUrl}/api/schema`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: ApiResponse<JsonSchema> = await response.json();
      console.log("Received schema response:", data);

      if (data.status === "success" && data.data) {
        console.log("Setting schema to:", data.data);
        // Ensure we have a valid schema structure
        this.schema = {
          $defs: data.data.$defs || {},
          ...data.data,
        };
        this.isUsingDummySchema = false;
        console.log("Schema after update:", this.schema);
        this.requestUpdate();
      } else {
        console.warn("Received invalid schema data:", data);
      }
    } catch (error) {
      console.error("Error fetching schema:", error);
    }
  }

  private loadDummySchema() {
    console.log("Loading dummy schema for development");
    this.isUsingDummySchema = true;
    this.schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Example Nextflow Pipeline",
      description: "An example pipeline schema for development",
      $defs: {
        input_output_options: {
          title: "Input/Output Options",
          description:
            "Define where the pipeline should find input data and save output data",
          fa_icon: "fas fa-folder-open",
          properties: {
            input: {
              type: "string",
              format: "file-path",
              description: "Path to the input samplesheet",
              help_text:
                "Provide a path to a CSV or TSV file containing sample information",
            },
            outdir: {
              type: "string",
              format: "directory-path",
              description: "The output directory where results will be saved",
              default: "./results",
            },
          },
          required: ["input"],
        },
        reference_genome_options: {
          title: "Reference Genome Options",
          description: "Reference genome related files and options",
          fa_icon: "fas fa-dna",
          properties: {
            genome: {
              type: "string",
              description: "Name of reference genome",
              enum: ["GRCh38", "GRCh37", "GRCm38"],
              help_text: "Select a reference genome from the dropdown",
            },
            fasta: {
              type: "string",
              format: "file-path",
              description: "Path to FASTA genome file",
              help_text:
                "If not using a reference genome, provide the path to the FASTA file",
            },
          },
        },
        generic_options: {
          title: "Generic Options",
          description: "Less commonly used options",
          fa_icon: "fas fa-cog",
          properties: {
            help: {
              type: "boolean",
              description: "Display help text",
              default: false,
            },
            version: {
              type: "boolean",
              description: "Display version and exit",
              default: false,
            },
          },
        },
      },
    };
    this.requestUpdate();
  }

  private async handleSave() {
    try {
      console.log("Saving schema:", this.schema);
      const response = await fetch(`${this.baseUrl}/api/schema`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.schema),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = await response.json();
      console.log("Save response:", data);

      if (data.status === "success") {
        this.lastSaveStatus = "success";
        this.lastSaveTime = new Date();
        console.log("Schema saved successfully");
        // Refresh the schema to ensure we have the latest version
        await this.fetchSchema();
      } else {
        throw new Error(data.message || "Unknown error");
      }

      return data;
    } catch (error) {
      this.lastSaveStatus = "error";
      console.error("Failed to save schema:", error);
      throw error;
    }
  }

  private async handleFinish() {
    try {
      // Save one last time before finishing
      await this.handleSave();

      console.log("Sending finish command to:", `${this.baseUrl}/api/finish`);
      const response = await fetch(`${this.baseUrl}/api/finish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to finish: ${errorMessage}`);
    }
  }

  private normalizeKey(title: string): string {
    return (
      title
        .toLowerCase()
        // Replace spaces and special characters with underscores
        .replace(/[^a-z0-9]+/g, "_")
        // Remove leading/trailing underscores
        .replace(/^_+|_+$/g, "")
        // Replace multiple consecutive underscores with a single one
        .replace(/_+/g, "_")
    );
  }

  private async handleSchemaUpdate(name: string, section: Partial<SchemaDef>) {
    try {
      // Create a clean copy of the current schema to avoid reference issues
      const currentSchema = JSON.parse(JSON.stringify(this.schema));
      const currentDefs = currentSchema.$defs || {};

      // Find the original key in $defs that matches this section
      const originalKey = Object.keys(currentDefs).find((key) => {
        const def = currentDefs[key];
        return (
          def.title === name || key === name.toLowerCase().replace(/\s+/g, "_")
        );
      });

      // Generate the new key from the section title or name
      const newKey = this.normalizeKey(section.title || name);

      console.log(
        `Section update: Original key: ${originalKey}, New key: ${newKey}`,
      );
      console.log("Section update received:", section);

      // Create new $defs object with proper typing
      const newDefs: Required<JsonSchema>["$defs"] = {};

      // Copy all properties except the original key, maintaining order
      Object.entries(currentDefs).forEach(([key, value]) => {
        if (key !== originalKey) {
          newDefs[key] = value as SchemaDef;
        }
        // When we reach the original key's position, insert the updated section with new key
        if (key === originalKey) {
          newDefs[newKey] = {
            ...(originalKey ? (currentDefs[originalKey] as SchemaDef) : {}), // Preserve existing fields
            ...section, // Apply updates
            title: section.title || name, // Use section.title if provided, otherwise use name
          } as SchemaDef;
        }
      });

      // If this is a new section (no originalKey), add it at the end
      if (!originalKey) {
        newDefs[newKey] = {
          ...section,
          title: section.title || name,
        } as SchemaDef;
      }

      // Create the updated schema with new $defs
      const updatedSchema = {
        ...currentSchema,
        $defs: newDefs,
      };

      console.log("Updated schema:", updatedSchema);

      // Update the local state
      this.schema = updatedSchema;

      // Request an update
      this.requestUpdate();

      // Auto-save on every change
      await this.handleSave();
    } catch (error) {
      console.error("Error updating schema:", error);
    }
  }

  private async handleSectionReorder(e: CustomEvent) {
    e.stopPropagation();
    const { draggedName, targetName } = e.detail;
    console.log(`Reordering sections: ${draggedName} -> ${targetName}`);

    const currentDefs = this.schema.$defs || {};
    const defKeys = Object.keys(currentDefs);

    // Find the keys for the dragged and target sections
    const draggedKey = defKeys.find(
      (key) => currentDefs[key].title === draggedName,
    );
    const targetKey = defKeys.find(
      (key) => currentDefs[key].title === targetName,
    );

    if (!draggedKey || !targetKey) return;

    const draggedIndex = defKeys.indexOf(draggedKey);
    const targetIndex = defKeys.indexOf(targetKey);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Create new ordered keys array
    const newDefKeys = [...defKeys];
    newDefKeys.splice(draggedIndex, 1);
    newDefKeys.splice(targetIndex, 0, draggedKey);

    // Create reordered $defs object
    const reorderedDefs: Required<JsonSchema>["$defs"] = {};
    for (const key of newDefKeys) {
      reorderedDefs[key] = currentDefs[key];
    }

    // Update the schema with reordered sections
    this.schema = {
      ...this.schema,
      $defs: reorderedDefs,
    };

    this.requestUpdate();

    // Auto-save on every change
    await this.handleSave();
  }

  private async handlePropertyMoveToSection(e: CustomEvent) {
    e.stopPropagation();
    const { propertyName, targetSection: targetSectionName } = e.detail;
    console.log(
      `Moving property ${propertyName} to section ${targetSectionName}`,
    );

    // Find source section and property
    const currentDefs = this.schema.$defs || {};
    let sourceSection: any = null;
    let sourceSectionKey: string | null = null;

    for (const [key, def] of Object.entries(currentDefs)) {
      if (def.properties && propertyName in def.properties) {
        sourceSection = def;
        sourceSectionKey = key;
        break;
      }
    }

    if (!sourceSection || !sourceSectionKey) return;

    // Find target section
    const targetSectionKey = Object.keys(currentDefs).find(
      (key) => currentDefs[key].title === targetSectionName,
    );

    if (!targetSectionKey) return;

    // Get the property to move
    const propertyToMove = sourceSection.properties[propertyName];
    const isRequired = (sourceSection.required || []).includes(propertyName);

    // Remove from source
    const { [propertyName]: removed, ...remainingProps } =
      sourceSection.properties;
    const updatedSourceRequired = (sourceSection.required || []).filter(
      (r: string) => r !== propertyName,
    );

    // Add to target (at the end)
    const targetSectionDef = currentDefs[targetSectionKey];
    const updatedTargetProps = {
      ...(targetSectionDef.properties || {}),
      [propertyName]: propertyToMove,
    };
    const updatedTargetRequired = isRequired
      ? [...(targetSectionDef.required || []), propertyName]
      : targetSectionDef.required || [];

    // Update schema
    this.schema = {
      ...this.schema,
      $defs: {
        ...currentDefs,
        [sourceSectionKey]: {
          ...sourceSection,
          properties: remainingProps,
          required: updatedSourceRequired,
        },
        [targetSectionKey]: {
          ...targetSectionDef,
          properties: updatedTargetProps,
          required: updatedTargetRequired,
        },
      },
    };

    this.requestUpdate();
    await this.handleSave();
  }

  private async handlePropertyMoveBetweenSections(e: CustomEvent) {
    e.stopPropagation();
    const { propertyName, sourceSection, targetSection, targetProperty } =
      e.detail;
    console.log(
      `Moving property ${propertyName} from ${sourceSection} to ${targetSection}, before ${targetProperty}`,
    );

    const currentDefs = this.schema.$defs || {};

    // Find source section key
    const sourceSectionKey = Object.keys(currentDefs).find(
      (key) => currentDefs[key].title === sourceSection,
    );

    // Find target section key
    const targetSectionKey = Object.keys(currentDefs).find(
      (key) => currentDefs[key].title === targetSection,
    );

    if (!sourceSectionKey || !targetSectionKey) return;

    const sourceDef = currentDefs[sourceSectionKey];
    const targetDef = currentDefs[targetSectionKey];

    // Get the property to move
    const propertyToMove = sourceDef.properties?.[propertyName];
    if (!propertyToMove) return;

    const isRequired = (sourceDef.required || []).includes(propertyName);

    // Remove from source
    const { [propertyName]: removed, ...remainingSourceProps } =
      sourceDef.properties || {};
    const updatedSourceRequired = (sourceDef.required || []).filter(
      (r: string) => r !== propertyName,
    );

    // Insert into target at the correct position
    const targetProps = targetDef.properties || {};
    const targetPropKeys = Object.keys(targetProps);
    const insertIndex = targetPropKeys.indexOf(targetProperty);

    const newTargetPropKeys = [...targetPropKeys];
    if (insertIndex !== -1) {
      newTargetPropKeys.splice(insertIndex, 0, propertyName);
    } else {
      newTargetPropKeys.push(propertyName);
    }

    const updatedTargetProps: Record<string, any> = {};
    for (const key of newTargetPropKeys) {
      if (key === propertyName) {
        updatedTargetProps[key] = propertyToMove;
      } else {
        updatedTargetProps[key] = targetProps[key];
      }
    }

    const updatedTargetRequired = isRequired
      ? [...(targetDef.required || []), propertyName]
      : targetDef.required || [];

    // Update schema
    this.schema = {
      ...this.schema,
      $defs: {
        ...currentDefs,
        [sourceSectionKey]: {
          ...sourceDef,
          properties: remainingSourceProps,
          required: updatedSourceRequired,
        },
        [targetSectionKey]: {
          ...targetDef,
          properties: updatedTargetProps,
          required: updatedTargetRequired,
        },
      },
    };

    this.requestUpdate();
    await this.handleSave();
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
              icon=${this.serverStatus === "connected"
                ? "fas check-circle"
                : "fas exclamation-circle"}
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
                    ${this.lastSaveStatus === "success"
                      ? "Saved successfully"
                      : "Save failed"}
                  </div>
                `
              : ""}
            ${this.lastSaveTime
              ? html`
                  <small class="save-time text-muted text-centered">
                    ${formatDistanceToNow(this.lastSaveTime, {
                      addSuffix: true,
                    })}
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
                  @section-update=${(e: CustomEvent) =>
                    this.handleSchemaUpdate(e.detail.name, e.detail.section)}
                  @section-reorder=${this.handleSectionReorder}
                  @property-move-to-section=${this.handlePropertyMoveToSection}
                  @property-move-between-sections=${this
                    .handlePropertyMoveBetweenSections}
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
