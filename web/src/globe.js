import {mountGlobeExplorer} from './globe-explorer.js';
import './app.css';
import './globe.css';

const explorer=mountGlobeExplorer(document.getElementById('globe-content'));
window.addEventListener('pagehide',()=>explorer.destroy(),{once:true});
