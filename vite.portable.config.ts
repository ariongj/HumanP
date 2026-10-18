import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

export default defineConfig({
 plugins:[react()],publicDir:false,
 resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
 define:{'process.env.NODE_ENV':JSON.stringify('production')},
 build:{outDir:'dist-portable',emptyOutDir:true,
  lib:{entry:'static-app/main.tsx',name:'HumanPlus',formats:['iife'],fileName:()=> 'humanplus.js',cssFileName:'humanplus'},
 },
});
