/* Preserve the public graph entry URL while sharing one application shell. */
location.replace(new URL('index.html#discover',location.href).href);
