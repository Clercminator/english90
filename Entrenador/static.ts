import { connectAdvertising } from './advertising';

const ads = connectAdvertising();
if (document.body.dataset.article === 'true') ads.setPlacement('article');
