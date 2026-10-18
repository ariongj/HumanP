import React from 'react';
import {createRoot} from 'react-dom/client';
import HumanApp from '../app/human-app';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><HumanApp/></React.StrictMode>);
