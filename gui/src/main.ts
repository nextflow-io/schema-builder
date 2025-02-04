// Main styles
import './styles/main.css';

// Components
import './components/schema-viewer/json-schema-viewer';
import './components/app-root/app-root';

// Fontawesome
import { library, dom } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';

// Add all icons to the library
library.add(fas, far, fab);

// Replace any existing <i> tags with <svg> elements
dom.watch();

// Initialize any global app configuration here if needed
console.log('JSON Schema Web Builder initialized');
