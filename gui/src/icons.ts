// Track initialization state
let initialized = false;
let library: any = null;

// Export a function to initialize FontAwesome core and basic icons
export const initFontAwesome = async () => {
  if (initialized) return library;

  // Load essential icons (core + solid)
  const [
    { library: faLibrary, dom },
    { fas }
  ] = await Promise.all([
    import('@fortawesome/fontawesome-svg-core'),
    import('@fortawesome/free-solid-svg-icons')
  ]);

  library = faLibrary;
  library.add(fas);
  dom.watch();
  initialized = true;

  return library;
};

// Export a function to load extended icon sets
export const loadExtendedIcons = async () => {
  // Ensure core is initialized
  if (!library) {
    await initFontAwesome();
  }

  // Load extended icons (brands)
  const { fab } = await import('@fortawesome/free-brands-svg-icons');

  library.add(fab);
  return { fab };
};
