import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Toast } from '@capacitor/toast';
import { StatusBar, Style } from '@capacitor/status-bar';

const IconUpload = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IconSave = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconTrash = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const IconMenu = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
const IconClose = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconMoon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
const IconSun = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="1" y1="12" x2="3" y2="12"/></svg>;

const App = () => {
  const [theme, setTheme] = useState('dark');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentImage, setCurrentImage] = useState(null);
  const [config, setConfig] = useState({ mode: 'H', zoom: 0.9, offsetX: 0, offsetY: 0 });
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    const updateStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
        await StatusBar.setBackgroundColor({ color: isDark ? '#0a0a0c' : '#f4f4f5' });
      } catch (e) { console.log("StatusBar no disponible"); }
    };
    updateStatusBar();
  }, [theme]);

  const DIM_HORIZ = { w: 388, h: 276 };
  const TARGET_SIZE_BYTES = 188.5 * 1024;

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
    canvas.width = targetW; canvas.height = targetH;
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
      setFiles(prev => [...prev, { id: Date.now(), name: `${currentImage.name}_amiibo.png`, preview: URL.createObjectURL(finalBlob), blob: finalBlob, info: isH ? '388x276 | 96 DPI' : '96 DPI', weight: (finalBlob.size / 1024).toFixed(2) + ' KB' }]);
      setCurrentImage(null);
    }, 'image/png');
  };

  // --- FUNCIÓN DE GUARDADO CON PEDIDO DE PERMISO ---
  const saveToPhotosFolder = async () => {
    const toSave = selectedIds.length > 0 ? files.filter(f => selectedIds.includes(f.id)) : files;
    if (toSave.length === 0) return alert("Selecciona imágenes primero");
    
    try {
      // 1. PEDIR PERMISOS EN TIEMPO REAL (Esto arregla el EACCES)
      const perm = await Filesystem.checkPermissions();
      if (perm.publicStorage !== 'granted') {
        await Filesystem.requestPermissions();
      }

      const folderName = 'Photos_Studiio';
      
      try {
        await Filesystem.mkdir({
          path: folderName,
          directory: Directory.Documents,
          recursive: true
        });
      } catch (e) { /* Ya existe */ }

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
                directory: Directory.Documents,
                recursive: true
              });
              resolve();
            } catch (err) { reject(err); }
          };
        });
      }
      await Toast.show({ text: `¡Éxito! Guardadas en Documentos/${folderName}`, duration: 'long' });
    } catch (e) {
      alert("Error de guardado: " + e.message);
    }
  };

  return (
    <div className={`flex flex-col h-screen transition-colors duration-500 ${isDark ? 'bg-[#0a0a0c] text-white' : 'bg-[#f4f4f5] text-black'}`}>
      {isMenuOpen && (
        <div className="fixed inset-0 z-[100] flex animate-in fade-in duration-300">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}></div>
          <div className={`relative w-72 h-full shadow-2xl p-6 flex flex-col transition-transform duration-300 ${isDark ? 'bg-[#111] text-white' : 'bg-white text-black'}`}>
            <div className="flex justify-between items-center mb-10"><span className="font-black italic uppercase tracking-widest text-sm">Configuración</span><button onClick={() => setIsMenuOpen(false)} className="p-2 opacity-60"><IconClose /></button></div>
            <div className="space-y-4">
              <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`w-full flex justify-between items-center p-4 rounded-2xl border transition-all ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
                <span className="text-[10px] font-black uppercase tracking-tighter">Modo {isDark ? 'Claro' : 'Oscuro'}</span>
                <div className={isDark ? 'text-yellow-400' : 'text-indigo-600'}>{isDark ? <IconSun /> : <IconMoon />}</div>
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex-grow overflow-y-auto px-4 pt-[env(safe-area-inset-top,60px)] pb-32">
        <header className={`flex justify-between items-center mb-8 p-4 rounded-3xl border shadow-2xl transition-all ${isDark ? 'bg-[#111]/80 border-slate-800' : 'bg-white/80 border-gray-200'} backdrop-blur-xl`}>
          <div className="flex items-center gap-4"><button onClick={() => setIsMenuOpen(true)} className="p-1 opacity-70"><IconMenu /></button><h1 className="text-xl font-black italic uppercase tracking-tighter text-emerald-500">Studiio</h1></div>
          <div className="flex gap-2">
            {selectedIds.length > 0 && <button onClick={() => setFiles(f => f.filter(i => !selectedIds.includes(i.id)))} className="bg-red-600/20 text-red-500 p-2 rounded-xl border border-red-600/50"><IconTrash /></button>}
            <button onClick={saveToPhotosFolder} className="bg-emerald-600 px-5 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 text-white shadow-lg shadow-emerald-500/30"><IconSave /> Guardar</button>
          </div>
        </header>
        {!currentImage ? (
          <div className={`border-2 border-dashed rounded-[3rem] p-16 text-center transition-all ${isDark ? 'border-slate-800 bg-white/5' : 'border-gray-300 bg-black/5'}`} onClick={() => document.getElementById('f').click()}>
            <div className="flex justify-center text-emerald-500 mb-4 scale-125"><IconUpload /></div>
            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Cargar Imagen</p>
            <input id="f" type="file" className="hidden" accept="image/*" onChange={(e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => setCurrentImage({ src: ev.target.result, name: file.name.split('.')[0] }); reader.readAsDataURL(file); } }} />
          </div>
        ) : (
          <div className={`p-6 rounded-[3rem] border animate-in fade-in zoom-in duration-300 ${isDark ? 'bg-[#111] border-slate-800' : 'bg-white border-gray-200'}`}>
             <div className="relative h-72 bg-black rounded-3xl overflow-hidden mb-6 flex items-center justify-center border border-white/5 shadow-inner">
                <img ref={imgRef} src={currentImage.src} className="absolute" style={{ transform: `translate(${config.offsetX}%, ${config.offsetY}%) scale(${config.zoom})`, width: '100%', objectFit: 'contain' }} />
             </div>
             <div className="space-y-6">
               <input type="range" min="0.1" max="1.5" step="0.01" value={config.zoom} onChange={e => setConfig({...config, zoom: parseFloat(e.target.value)})} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
               <div className="grid grid-cols-2 gap-4">
                 <button onClick={() => setConfig({...config, mode: 'H'})} className={`py-4 rounded-2xl text-[10px] font-bold border transition-all ${config.mode === 'H' ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg' : (isDark ? 'border-slate-800 text-slate-500' : 'border-gray-200 text-gray-400')}`}>HORIZONTAL</button>
                 <button onClick={() => setConfig({...config, mode: 'V'})} className={`py-4 rounded-2xl text-[10px] font-bold border transition-all ${config.mode === 'V' ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg' : (isDark ? 'border-slate-800 text-slate-500' : 'border-gray-200 text-gray-400')}`}>VERTICAL</button>
               </div>
               <button onClick={processImage} className="w-full bg-emerald-600 py-5 rounded-3xl font-black uppercase text-xs text-white shadow-xl active:scale-95 transition-transform">Procesar Imagen</button>
               <button onClick={() => setCurrentImage(null)} className="w-full text-slate-500 text-[10px] font-bold uppercase py-2 text-center tracking-widest">Cancelar</button>
             </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-5 mt-10">
          {files.map(f => (
            <div key={f.id} onClick={() => setSelectedIds(prev => prev.includes(f.id) ? prev.filter(i => i !== f.id) : [...prev, f.id])} className={`relative p-3 rounded-[2rem] border transition-all duration-300 ${selectedIds.includes(f.id) ? 'border-emerald-500 bg-emerald-500/10 scale-95' : (isDark ? 'border-slate-800 bg-black/40' : 'border-gray-200 bg-white shadow-sm')}`}>
              <img src={f.preview} className="w-full h-36 object-contain rounded-2xl" />
              <div className="mt-3 text-center"><p className="text-[8px] truncate font-black uppercase opacity-60">{f.name}</p><p className="text-[7px] font-mono text-emerald-500 mt-1 font-bold">{f.info} • {f.weight}</p></div>
              {selectedIds.includes(f.id) && <div className="absolute top-3 right-3 bg-emerald-500 rounded-full p-1.5 shadow-lg border-2 border-black"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg></div>}
            </div>
          ))}
        </div>
      </div>
      <footer className={`mt-auto w-full backdrop-blur-2xl py-8 border-t text-center z-[80] pb-[env(safe-area-inset-bottom,20px)] transition-all ${isDark ? 'bg-[#0a0a0c]/80 border-slate-900' : 'bg-[#f4f4f5]/80 border-gray-200'}`}>
        <p className={`text-[8px] font-black uppercase tracking-[0.4em] ${isDark ? 'text-slate-700' : 'text-gray-400'}`}>Creado por 🇲🇽 para todo el 🌎</p>
      </footer>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
