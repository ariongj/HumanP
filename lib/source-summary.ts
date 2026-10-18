import manifest from './import-manifest.json';
export const sourceCounts={datasets:Object.keys(manifest).filter(k=>k.startsWith('data/')).length,documents:Object.keys(manifest).filter(k=>k.startsWith('documents/')).length};
