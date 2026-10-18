import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:'static-app',base:'./',plugins:[react()],publicDir:'../public',resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},build:{outDir:'../dist-pages',emptyOutDir:true},server:{host:'127.0.0.1',port:4187},preview:{host:'127.0.0.1',port:4187}});
