import './theme';
import { renderCommercial } from './commerce';
const view = document.getElementById('view')!;
const route = location.pathname.includes('cuenta')?'account':location.pathname.includes('pago')?'payment':'landing';
renderCommercial(view,route);
