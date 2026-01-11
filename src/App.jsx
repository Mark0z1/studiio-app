import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Toast } from '@capacitor/toast';

const IconUpload = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IconSave = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconTrash = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const IconTheme = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;

const App = () => {
  const [theme, setTheme] = useState('dark');
  const [files, setFiles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentImage, setCurrentImage] = useState(null);
  const [config, setConfig] = useState({ mode: 'H', zoom: 0.9, offsetX: 0, offsetY: 0 });
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  const DIM_HORIZ = { w: 388, h: 276 };
  const TARGET_SIZE_BYTES = 188.5 * 1024;

  const isDark = theme === 'dark';

  // Lógica de PNG y DPI intacta
  const crcTable = useMemo(() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
      table[i] = c;
    }
    return table;
  }, []);

  const calculateCrc32 = (data) => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) { crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF]; }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  const createPngChunk = (type, data) => {
    const typeBytes = new TextEncoder().encode(type);
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    const crcData = new Uint8Array(4 + data.length);
    crcData.set(typeBytes); crcData.set(data, 4);
    view.setUint32(8 + data.length, calculateCrc32(crcData));
    return chunk;
  };

  const processImage = async () => {
    if (!currentImage || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
    const isH = config.mode === 'H';
    const targetW = isH ? DIM_HORIZ.w : imgRef.current.naturalWidth;
    const targetH = isH ? DIM_HORIZ.h : imgRef.current.naturalHeight;

    canvas.width = targetW;
    canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);
    const scale = Math.min(targetW / imgRef.current.naturalWidth, targetH / imgRef.current.naturalHeight) * config.zoom;
    const w = imgRef.current.naturalWidth * scale;
    const h = imgRef.current.naturalHeight * scale;
    ctx.drawImage(imgRef.current, (targetW - w) / 2 + (config.offsetX * targetW / 100), (targetH - h) / 2 + (config.offsetY * targetH / 100), w, h);

    canvas.toBlob(async (blob) => {
      let buffer = await blob.arrayBuffer();
      const physChunk = createPngChunk('pHYs', new Uint8Array([0,0,14,196,0,0,14,196,1]));
      let finalBuffer = new Uint8Array(buffer.byteLength + physChunk.length);
      finalBuffer.set(new Uint8Array(buffer.slice(0, 33)), 0);
      finalBuffer.set(physChunk, 33);
      finalBuffer.set(new Uint8Array(buffer.slice(33)), 33 + physChunk.length);

      if (isH && finalBuffer.byteLength < TARGET_SIZE_BYTES) {
        const paddingNeeded = Math.floor(TARGET_SIZE_BYTES - finalBuffer.byteLength);
        if (paddingNeeded > 12) {
          const junkChunk = createPngChunk('pADd', new Uint8Array(paddingNeeded - 12).fill(0));
          const expanded = new Uint8Array(finalBuffer.byteLength + junkChunk.length);
          const iendPos = finalBuffer.byteLength - 12;
          expanded.set(finalBuffer.slice(0, iendPos), 0);
          expanded.set(junkChunk, iendPos);
          expanded.set(finalBuffer.slice(iendPos), iendPos + junkChunk.length);
          finalBuffer = expanded;
        }
      }

      const finalBlob = new Blob([finalBuffer], { type: 'image/png' });
      setFiles(prev => [...prev, {
        id: Date.now(),
        name: `${currentImage.name}_amiibo.png`,
        preview: URL.createObjectURL(finalBlob),
        blob: finalBlob,
        info: isH ? '388x276 | 96 DPI' : '96 DPI',
        weight: (finalBlob.size / 1024).toFixed(2) + ' KB'
      }]);
      setCurrentImage(null);
    }, 'image/png');
  };

  // NUEVA LÓGICA: GUARDADO DIRECTO SIN ZIP
  const saveToPhotosFolder = async () => {
    const toSave = selectedIds.length > 0 ? files.filter(f => selectedIds.includes(f.id)) : files;
    if (toSave.length === 0) return alert("Selecciona imágenes");

    try {
      const folderName = 'Photos_Studiio';
      
      for (const file of toSave) {
        const reader = new FileReader();
        reader.readAsDataURL(file.blob);
        await new Promise((resolve) => {
          reader.onloadend = async () => {
            const base64Data = reader.result.split(',')[1];
            await Filesystem.writeFile({
              path: `${folderName}/${file.name}`,
              data: base64Data,
              directory: Directory.Documents,
              recursive: true
            });
            resolve();
          };
        });
      }

      await Toast.show({
        text: `Guardadas ${toSave.length} imágenes en Documentos/${folderName}`,
        duration: 'long'
      });
    } catch (e) {
      alert("Error al guardar: " + e.message);
    }
  };

  return (
    <div className={`flex flex-col h-screen transition-colors duration-300 ${isDark ? 'bg-[#0a0a0c] text-white' : 'bg-[#f4f4f5] text-black'}`}>
      <div className="flex-grow overflow-y-auto px-4 pt-16 pb-24">
        <header className={`flex justify-between items-center mb-6 p-4 rounded-3xl border shadow-xl ${isDark ? 'bg-[#111] border-slate-800' : 'bg-white border-gray-200'}`}>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">Studiio</h1>
          <div className="flex gap-2">
            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`p-2 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700 text-yellow-400' : 'bg-gray-100 border-gray-200 text-indigo-600'}`}>
              <IconTheme />
            </button>
            <button onClick={saveToPhotosFolder} className="bg-emerald-600 px-5 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 text-white shadow-lg shadow-emerald-900/20">
              <IconSave /> Guardar
            </button>
          </div>
        </header>

        {!currentImage ? (
          <div className={`border-2 border-dashed rounded-[2.5rem] p-16 text-center ${isDark ? 'border-slate-800' : 'border-gray-300'}`} onClick={() => document.getElementById('f').click()}>
            <div className="flex justify-center text-emerald-500 mb-4"><IconUpload /></div>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Cargar Imagen</p>
            <input id="f" type="file" className="hidden" accept="image/*" onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => setCurrentImage({ src: ev.target.result, name: file.name.split('.')[0] });
                reader.readAsDataURL(file);
              }
            }} />
          </div>
        ) : (
          <div className={`p-5 rounded-[2.5rem] border ${isDark ? 'bg-[#111] border-slate-800' : 'bg-white border-gray-200'}`}>
             <div className="relative h-64 bg-black rounded-2xl overflow-hidden mb-5 flex items-center justify-center border border-slate-800">
                <img ref={imgRef} src={currentImage.src} className="absolute" style={{ transform: `translate(${config.offsetX}%, ${config.offsetY}%) scale(${config.zoom})`, width: '100%', objectFit: 'contain' }} />
             </div>
             <div className="space-y-4">
               <input type="range" min="0.1" max="1.5" step="0.01" value={config.zoom} onChange={e => setConfig({...config, zoom: parseFloat(e.target.value)})} className="w-full accent-emerald-500" />
               <div className="grid grid-cols-2 gap-3">
                 <button onClick={() => setConfig({...config, mode: 'H'})} className={`py-3 rounded-xl text-[10px] font-bold border ${config.mode === 'H' ? 'bg-emerald-600 text-white border-emerald-500' : (isDark ? 'border-slate-800 text-slate-500' : 'border-gray-200 text-gray-400')}`}>HORIZ</button>
                 <button onClick={() => setConfig({...config, mode: 'V'})} className={`py-3 rounded-xl text-[10px] font-bold border ${config.mode === 'V' ? 'bg-emerald-600 text-white border-emerald-500' : (isDark ? 'border-slate-800 text-slate-500' : 'border-gray-200 text-gray-400')}`}>VERT</button>
               </div>
               <button onClick={processImage} className="w-full bg-emerald-600 py-4 rounded-2xl font-black uppercase text-xs text-white shadow-xl">Procesar</button>
               <button onClick={() => setCurrentImage(null)} className="w-full text-slate-500 text-[10px] font-bold uppercase py-2 text-center">Cancelar</button>
             </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mt-8">
          {files.map(f => (
            <div key={f.id} onClick={() => setSelectedIds(prev => prev.includes(f.id) ? prev.filter(i => i !== f.id) : [...prev, f.id])} className={`relative p-2 rounded-2xl border transition-all ${selectedIds.includes(f.id) ? 'border-emerald-500 bg-emerald-500/10' : (isDark ? 'border-slate-800 bg-black' : 'border-gray-200 bg-white')}`}>
              <img src={f.preview} className="w-full h-32 object-contain rounded-lg" />
              <div className="mt-2 text-center">
                <p className="text-[7px] truncate font-bold uppercase text-slate-400">{f.name}</p>
                <p className="text-[6px] font-mono text-emerald-500 mt-1">{f.info} • {f.weight}</p>
              </div>
              {selectedIds.includes(f.id) && (
                <div className="absolute top-2 right-2 bg-emerald-500 rounded-full p-1 shadow-lg border-2 border-black">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className={`fixed bottom-0 w-full backdrop-blur-md py-6 border-t text-center z-50 ${isDark ? 'bg-[#0a0a0c]/90 border-slate-900' : 'bg-[#f4f4f5]/90 border-gray-200'}`}>
        <p className={`text-[8px] font-bold uppercase tracking-[0.3em] ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
          Creado por 🇲🇽 para todo el 🌎
        </p>
      </footer>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
