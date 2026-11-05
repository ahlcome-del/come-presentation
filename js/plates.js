/**
 * The five antique map plates — pure data, no geometry and no libraries.
 *
 * Kept apart from maps.js on purpose: the 3D scene needs the plate count and the
 * spec objects at build time, while the appalling cost of d3-geo + topojson
 * (and of drawing 5 × 2048 × 1418 canvases) is only paid AFTER the loader is gone.
 * Anything here must stay dependency-free.
 *
 * projection() returns lazy factories: the projection is built when a plate is drawn.
 */

import {
  geoConicConformal, geoOrthographic, geoAzimuthalEqualArea, geoConicEquidistant,
} from './vendor/libs.js';

export const PLATES = [
  {
    id: 'antiquity', title: 'Mare Nostrum', sub: 'Le monde méditerranéen antique', data: 'land-50m.json',
    projection: () => geoConicConformal().parallels([32, 44]).rotate([-17, 0]),
    bbox: [-9.5, 28, 41.5, 47.5], step: 5,
    markers: [['Roma', 12.5, 41.9], ['Athenae', 23.73, 37.98], ['Carthago', 10.32, 36.85], ['Alexandria', 29.92, 31.2],
      ['Byzantium', 28.98, 41.01], ['Massalia', 5.37, 43.3], ['Gades', -6.29, 36.53], ['Antiochia', 36.16, 36.2]],
    routes: [
      [[29.92, 31.25], [26, 33.6], [21, 35.2], [16.2, 37.4], [15.65, 38.25], [14, 40.4], [12.3, 41.7]],
      [[10.32, 37.0], [11.2, 38.3], [12.0, 40.5], [12.3, 41.7]],
      [[-6.3, 36.4], [-2, 36.1], [4, 37.4], [10.32, 37.0]],
      [[23.6, 37.85], [24.6, 38.6], [26.0, 39.9], [26.6, 40.4], [28.98, 41.0]],
    ],
    labels: [['MARE INTERNVM', 18.5, 34.2, 1.0, -4], ['Oceanus', -8.0, 31.5, .8, -70]],
    regions: [['ITALIA', 14.5, 43.2, -40], ['GRAECIA', 22.0, 39.6, -10], ['AEGYPTVS', 29.5, 28.6, 0], ['HISPANIA', -4.0, 40.0, 0], ['GALLIA', 3.0, 46.3, 0], ['AFRICA', 9.0, 33.0, 0], ['ASIA', 33.5, 39.0, 0]],
    monsters: [['serpent', 6.2, 38.3, .9, 0], ['ship', 17.5, 36.0, .9, 0], ['ship', 27.5, 34.3, .7, 1], ['ship', -2.5, 35.9, .55, 1]],
    cartouche: 'bl',
  },
  {
    id: 'middle-ages', title: 'Europa', sub: 'Royaumes et routes, XIe – XVe siècle', data: 'land-50m.json',
    projection: () => geoConicConformal().parallels([40, 56]).rotate([-10, 0]),
    bbox: [-11, 35.5, 31, 60.5], step: 5,
    markers: [['Paris', 2.35, 48.85], ['Aix-la-Chapelle', 6.08, 50.78], ['Roma', 12.5, 41.9], ['Venezia', 12.33, 45.44],
      ['Córdoba', -4.78, 37.88], ['London', -0.12, 51.5], ['Lübeck', 10.69, 53.87], ['Brugge', 3.22, 51.21], ['Praha', 14.42, 50.08]],
    routes: [
      [[12.4, 45.3], [14, 44.2], [16.5, 42.3], [18.8, 40.6], [19.6, 39.2], [21.2, 37.0], [23.5, 36.3], [25.4, 37.5], [26.1, 39.5], [26.5, 40.3]],
      [[10.85, 54.2], [11.6, 54.9], [12.0, 56.3], [11.4, 57.5], [9.6, 57.9], [7.4, 57.6], [5.5, 55.5], [4.0, 53.5], [3.0, 51.5]],
      [[3.0, 51.45], [1.6, 51.0], [-0.5, 50.4], [-5.2, 49.6], [-6, 47.5], [-4.5, 45.0], [-9.5, 43.2], [-9.6, 39], [-8.9, 37], [-6.2, 36.3]],
    ],
    labels: [['MARE GERMANICVM', 3.5, 56.2, .78, -8], ['Mare Mediterraneum', 6.0, 39.0, .8, -6], ['Oceanus Atlanticus', -8.5, 46.5, .78, -62]],
    regions: [['FRANCIA', 2.5, 46.8, 0], ['ANGLIA', -1.6, 52.6, 0], ['IMPERIVM', 11.0, 51.5, 0], ['HISPANIA', -4.0, 40.3, 0], ['ITALIA', 13.0, 43.0, -40], ['POLONIA', 20.0, 52.2, 0], ['HVNGARIA', 19.5, 47.2, 0]],
    monsters: [['whale', -15.5, 52.0, 1.0, 0], ['serpent', -13.5, 44.5, .9, 1], ['ship', 4.2, 54.1, .65, 0], ['ship', 4.0, 38.3, .7, 1]],
    cartouche: 'br',
  },
  {
    id: 'discovery', title: 'Mare Oceanum', sub: 'Routes atlantiques, XVe – XVIe siècle', data: 'countries-110m.json',
    projection: () => geoOrthographic().rotate([32, -8]).precision(0.2),
    sphere: true, step: 15,
    markers: [['Lisboa', -9.14, 38.72], ['Santo Domingo', -69.9, 18.47], ['Cabo da Boa Esperança', 18.47, -34.36],
      ['Salvador', -38.5, -12.97], ['Elmina', -1.35, 5.08]],
    routes: [
      [[-6.3, 36.6], [-16, 28.2], [-30, 22], [-50, 18], [-62, 16.8], [-69.9, 18.2]],
      [[-9.4, 38.6], [-17.5, 26], [-24, 12], [-27, -4], [-24, -22], [-8, -34.5], [10, -36.5], [18.47, -34.8]],
      [[-9.4, 38.6], [-18, 22], [-17.5, 12], [-10, 4.2], [-1.35, 4.8]],
      [[-24, 12], [-30, 0], [-38.3, -12.97]],
    ],
    labels: [['OCEANVS', -38, 30, 1.0, 0], ['Mare Aethiopicum', -12, -16, .8, 0]],
    regions: [['AFRICA', 18, 8, 0], ['BRASIL', -50, -8, 0], ['EVROPA', 8, 47, 0]],
    monsters: [['serpent', -40, 8, 1.1, 0], ['whale', -22, -26, 1.0, 1], ['ship', -48, 22, .9, 0], ['ship', -18, 2, .8, 1], ['ship', -3, -28, .7, 0]],
    cartouche: 'bl',
  },
  {
    id: 'industrial', title: 'Africa, 1884', sub: 'Côtes et escales au temps de la conférence de Berlin', data: 'land-50m.json',
    projection: () => geoAzimuthalEqualArea().rotate([-17, -2]),
    bbox: [-19, -36, 52, 37.5], step: 10,
    markers: [['Lomé', 1.22, 6.13], ['Douala', 9.7, 4.05], ['Lüderitz', 15.16, -26.65], ['Windhoek', 17.08, -22.56],
      ['Dar es Salaam', 39.28, -6.8], ['Le Cap', 18.42, -33.92], ['Le Caire', 31.24, 30.04], ['Dakar', -17.44, 14.69]],
    routes: [
      [[-10, 37.5], [-15.5, 28], [-18.2, 20], [-17.9, 14.2], [-15.5, 9.5], [-9, 4.0], [-2, 4.4], [1.22, 5.9], [5.5, 4.0], [9.4, 3.8]],
      [[9.4, 3.8], [8.3, -2], [10.5, -12], [12.2, -20], [14.6, -26.65]],
      [[32.4, 31.4], [32.55, 29.8], [35.5, 25], [39, 18], [43.3, 12.6], [50.5, 11.6], [49.5, 5], [44, -1.5], [39.8, -6.6]],
    ],
    labels: [['OCEANVS ATLANTICVS', -12, -10, .8, -78], ['Mare Indicum', 46, -16, .8, -70]],
    regions: [['SAHARA', 10, 23, 0], ['SVDAN', 24, 12, 0], ['CONGO', 21, -2, 0], ['KALAHARI', 22, -23, 0]],
    monsters: [['whale', -6, -24, 1.0, 0], ['ship', -11, 2, .8, 0], ['serpent', 58, -6, .9, 1], ['ship', 46, -28, .7, 1]],
    cartouche: 'bl',
  },
  {
    id: 'twentieth', title: 'Europa, 1919', sub: 'Capitales de la conférence de la paix', data: 'land-50m.json',
    projection: () => geoConicConformal().parallels([42, 58]).rotate([-14, 0]),
    bbox: [-9, 36.5, 35, 60.5], step: 5,
    markers: [['Versailles', 2.13, 48.8], ['London', -0.12, 51.5], ['Berlin', 13.4, 52.52], ['Wien', 16.37, 48.21],
      ['Warszawa', 21.01, 52.23], ['Praha', 14.42, 50.08], ['Budapest', 19.04, 47.5], ['Beograd', 20.46, 44.82], ['Roma', 12.5, 41.9]],
    routes: [
      [[2.13, 48.8], [8.7, 50.1], [13.4, 52.52], [21.01, 52.23]],
      [[13.4, 52.52], [14.42, 50.08], [16.37, 48.21], [19.04, 47.5], [20.46, 44.82]],
    ],
    rail: true,
    labels: [['MARE BALTICVM', 18.6, 56.8, .7, -20], ['Mare Mediterraneum', 6.5, 39.2, .78, -6]],
    regions: [['FRANCE', 2.0, 46.6, 0], ['ALLEMAGNE', 10.5, 51.0, 0], ['POLOGNE', 20.5, 51.6, 0], ['AVTRICHE', 14.3, 47.4, 0], ['ITALIE', 12.8, 43.1, -40], ['ROVMANIE', 25.2, 45.8, 0], ['ESPAGNE', -3.8, 40.3, 0]],
    monsters: [['ship', -6.0, 49.0, .8, 0], ['ship', 4.5, 54.8, .7, 1], ['whale', -7.8, 56.5, .8, 0]],
    cartouche: 'br',
  },
];
