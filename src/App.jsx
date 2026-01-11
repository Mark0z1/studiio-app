  const saveToPhotosFolder = async () => {
    const toSave = selectedIds.length > 0 ? files.filter(f => selectedIds.includes(f.id)) : files;
    if (toSave.length === 0) return alert("Selecciona imágenes primero");

    // AVISO DE DIAGNÓSTICO: Si ves esto, el botón sí funciona.
    console.log("Iniciando guardado...");

    try {
      const folderName = 'Photos_Studiio';
      
      // 1. Intentar crear la carpeta por si no existe
      try {
        await Filesystem.mkdir({
          path: folderName,
          directory: Directory.Pictures,
          recursive: true
        });
      } catch (e) { /* Ya existe */ }

      // 2. Guardar archivos uno por uno
      for (const file of toSave) {
        const reader = new FileReader();
        reader.readAsDataURL(file.blob);
        await new Promise((resolve, reject) => {
          reader.onloadend = async () => {
            try {
              const base64Data = reader.result.split(',')[1];
              await Filesystem.writeFile({
                path: `${folderName}/${file.name}`,
                data: base64Data,
                directory: Directory.Pictures,
              });
              resolve();
            } catch (err) { reject(err); }
          };
        });
      }

      // 3. Notificación de éxito
      try {
        await Toast.show({
          text: `¡Éxito! Guardadas en Pictures/${folderName}`,
          duration: 'long'
        });
      } catch (e) {
        alert(`Guardado con éxito en Pictures/${folderName}`);
      }
      
    } catch (e) {
      // Si hay un error de permisos o de sistema, lo veremos aquí:
      alert("Error de Android: " + e.message);
    }
  };
