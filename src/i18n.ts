export const locales = ['en', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

/** Prefix a site path with the locale. English lives at the root. */
export function localePath(locale: Locale, path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return locale === defaultLocale ? clean : `/${locale}${clean}`;
}

/** The same page in the other language. */
export function alternatePath(pathname: string, target: Locale): string {
  const stripped = pathname.replace(/^\/fr(?=\/|$)/, '') || '/';
  return localePath(target, stripped);
}

export const ui = {
  en: {
    navProjects: 'Projects',
    navAbout: 'About',
    navCv: 'CV',
    languageLabel: 'Language',
    switchTo: 'Lire en français',
    headline:
      'Robotics engineer: C++, Python, ROS/ROS2. 3 years in industry, Electronics Engineer from Universidad Nacional de La Plata and M.Sc. from Ećole Centrale de Nantes.',
    explorerCaption:
      'Live: robots exploring an unknown map. Each one heads for the nearest frontier no other robot has claimed, along a path planned with A*.',
    explorerHint: 'Click or drag on the map to add and remove walls.',
    pause: 'Pause',
    play: 'Play',
    newMap: 'New map',
    robots: 'Robots',
    addRobot: 'Add a robot',
    removeRobot: 'Remove a robot',
    showPlans: 'Planned paths',
    mapped: 'mapped',
    explorerStatic: 'A finished multi-robot exploration run.',
    projectsTitle: 'Projects',
    inProgress: 'In progress',
    figure: 'Fig.',
    readProject: 'Read the case study',
    role: 'Role',
    team: 'Team',
    stack: 'Software',
    hardware: 'Hardware',
    year: 'Year',
    links: 'Links',
    progressLog: 'Progress log',
    backToProjects: 'All projects',
    fallbackNotice: '',
    contactTitle: 'Contact',
    contactText: 'The fastest way to reach me is by email.',
    footerSource: 'Source of this site',
    aboutTitle: 'About',
    notFoundTitle: 'Page not found',
    notFoundText: 'This page doesn’t exist. It may have moved when the site was reorganised.',
    notFoundLink: 'Go to the home page',
  },
  fr: {
    navProjects: 'Projets',
    navAbout: 'À propos',
    navCv: 'CV',
    languageLabel: 'Langue',
    switchTo: 'Read in English',
    headline:
      'Ingénieur en robotique : C++, Python, ROS/ROS2. 3 ans d’expérience en industrie, ingénieur électronicien de l’Universidad Nacional de La Plata, M.Sc. de Centrale Nantes.',
    explorerCaption:
      'En direct : des robots explorent une carte inconnue. Chacun se dirige vers la frontière la plus proche qu’aucun autre n’a réservée, par un chemin planifié avec A*.',
    explorerHint: 'Cliquez ou glissez sur la carte pour ajouter et retirer des murs.',
    pause: 'Pause',
    play: 'Reprendre',
    newMap: 'Nouvelle carte',
    robots: 'Robots',
    addRobot: 'Ajouter un robot',
    removeRobot: 'Retirer un robot',
    showPlans: 'Trajectoires prévues',
    mapped: 'cartographié',
    explorerStatic: 'Une exploration multi-robots terminée.',
    projectsTitle: 'Projets',
    inProgress: 'En cours',
    figure: 'Fig.',
    readProject: 'Lire l’étude de cas',
    role: 'Rôle',
    team: 'Équipe',
    stack: 'Logiciel',
    hardware: 'Matériel',
    year: 'Année',
    links: 'Liens',
    progressLog: 'Journal d’avancement',
    backToProjects: 'Tous les projets',
    fallbackNotice: 'Cette page n’est disponible qu’en anglais pour le moment.',
    contactTitle: 'Contact',
    contactText: 'Le plus simple pour me joindre est l’e-mail.',
    footerSource: 'Code source du site',
    aboutTitle: 'À propos',
    notFoundTitle: 'Page introuvable',
    notFoundText: 'Cette page n’existe pas. Elle a peut-être été déplacée.',
    notFoundLink: 'Retour à l’accueil',
  },
} satisfies Record<Locale, Record<string, string>>;
