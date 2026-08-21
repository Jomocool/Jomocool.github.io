// gitprofile.config.ts

const CONFIG = {
  github: {
    username: 'Jomocool', // Your GitHub org/user name. (This is the only required config)
  },
  /**
   * If you are deploying to https://<USERNAME>.github.io/, for example your repository is at https://github.com/Jomocool/Jomocool.github.io, set base to '/'.
   * If you are deploying to https://<USERNAME>.github.io/<REPO_NAME>/,
   * for example your repository is at https://github.com/Jomocool/portfolio, then set base to '/portfolio/'.
   */
  base: '/',
  projects: {
    github: {
      display: false, // Display GitHub projects?
      header: 'Github Projects',
      mode: 'automatic', // Mode can be: 'automatic' or 'manual'
      automatic: {
        sortBy: 'stars', // Sort projects by 'stars' or 'updated'
        limit: 8, // How many projects to display.
        exclude: {
          forks: false, // Forked projects will not be displayed if set to true.
          projects: [], // These projects will not be displayed. example: ['arifszn/my-project1', 'arifszn/my-project2']
        },
      },
      manual: {
        // Properties for manually specifying projects
        projects: [], // List of repository names to display. example: ['arifszn/my-project1', 'arifszn/my-project2']
      },
    },
    external: {
      header: 'My Projects',
      // To hide the `External Projects` section, keep it empty.
      projects: [],
    },
  },
  seo: { title: 'Portfolio of Ariful Alam', description: '', imageURL: '' },
  social: {
    phone: '13530228968',
    email: '13530228968@163.com',
  },
  resume: {
    fileUrl: '', // Empty fileUrl will hide the `Download Resume` button.
  },
  skills: ['C++', 'CMake', 'Git', 'Docker', 'CI/CD'],
  experiences: [
    {
      company: '辉立信息科技有限公司',
      position: 'C++开发工程师',
      from: '2026-07',
      to: '至今',
      companyLink: 'http://www.phillip-infotech.com/',
    },
    {
      company: '非凸科技',
      position: '量化开发工程师',
      from: '2025-07',
      to: '2026-01',
      companyLink: 'https://ft.tech/',
    },
    {
      company: '非凸科技',
      position: '量化开发实习生',
      from: '2024-07',
      to: '2025-04',
      companyLink: 'https://ft.tech/',
    },
  ],
  certifications: [
    {
      name: 'CET-6',
    },
  ],
  educations: [
    {
      institution: '华南理工大学-软件工程',
      degree: '本科',
      from: '2021',
      to: '2025',
    },
  ],
  publications: [],
  // Display articles from medium, dev, or local markdown under public/articles/.
  blog: {
    source: 'local', // medium | dev | local
    username: '', // required for medium / dev; unused for local
    articles: [
      {
        title: '第一阶段：概念入门 — 学习笔记',
        description:
          '从《交易系统：更新与跨越》出发，梳理 OMS 定义、分层架构与核心设计原则。',
        file: '01-概念入门-学习笔记.md',
        publishedAt: '2026-08-11',
        categories: ['OMS', '交易系统'],
      },
      {
        title: '第二阶段：架构理解 — 学习笔记',
        description:
          '对照华泰通信框架、XSTEP 与 FIX，理解券商侧交易系统的接入与订单链路。',
        file: '02-架构理解-学习笔记.md',
        publishedAt: '2026-08-12',
        categories: ['OMS', '架构'],
      },
      {
        title: '第三阶段：代码实战 — 学习笔记',
        description: '拆解交易所级撮合引擎与券商级交易平台，对照两种典型实现。',
        file: '03-代码实战-学习笔记.md',
        publishedAt: '2026-08-12',
        categories: ['OMS', '源码'],
      },
      {
        title: '第四阶段：自建设计 — 学习笔记',
        description:
          '用 C++17 实现简化版 OMS：下单、风控、撮合、成交与持仓更新。',
        file: '04-自建设计-学习笔记.md',
        publishedAt: '2026-08-12',
        categories: ['OMS', 'C++'],
      },
      {
        title: '完整交易系统建设路线图',
        description:
          '从 OMS 扩展到网关、风控、撮合、行情与清算，规划可讲解的完整闭环。',
        file: '05-完整交易系统-路线图.md',
        publishedAt: '2026-08-14',
        categories: ['OMS', '路线图'],
      },
      {
        title: '第五阶段：撮合引擎生产化 - 学习笔记',
        description: '在 C++17 简化版 OMS 的基础上，设计撮合引擎的生产化方案。',
        file: '06-撮合引擎生产化-学习笔记.md',
        publishedAt: '2026-08-20',
        categories: ['OMS', 'C++'],
      },
      {
        title: '第六阶段：网络层 - 学习笔记',
        description:
          'C++17，Asio + protobuf，把阶段 5 的撮合引擎暴露为 TCP 服务',
        file: '07-网络层-学习笔记.md',
        publishedAt: '2026-08-21',
        categories: ['OMS', 'C++'],
      },
    ],
  },
  googleAnalytics: {
    id: '', // GA3 tracking id/GA4 tag id UA-XXXXXXXXX-X | G-XXXXXXXXXX
  },
  // Track visitor interaction and behavior. https://www.hotjar.com
  hotjar: { id: '', snippetVersion: 6 },
  themeConfig: {
    defaultTheme: 'forest',

    // Hides the switch in the navbar
    // Useful if you want to support a single color mode
    disableSwitch: false,

    // Should use the prefers-color-scheme media-query,
    // using user system preferences, instead of the hardcoded defaultTheme
    respectPrefersColorScheme: false,

    // Display the ring in Profile picture
    displayAvatarRing: true,

    // Available themes. To remove any theme, exclude from here.
    themes: [
      'light',
      'dark',
      'cupcake',
      'bumblebee',
      'emerald',
      'corporate',
      'synthwave',
      'retro',
      'cyberpunk',
      'valentine',
      'halloween',
      'garden',
      'forest',
      'aqua',
      'lofi',
      'pastel',
      'fantasy',
      'wireframe',
      'black',
      'luxury',
      'dracula',
      'cmyk',
      'autumn',
      'business',
      'acid',
      'lemonade',
      'night',
      'coffee',
      'winter',
      'dim',
      'nord',
      'sunset',
      'caramellatte',
      'abyss',
      'silk',
      'procyon',
    ],
  },

  // Optional Footer. Supports plain text or HTML.
  footer: `Made with <a 
      class="text-primary" href="https://github.com/arifszn/gitprofile"
      target="_blank"
      rel="noreferrer"
    >GitProfile</a> and ❤️`,

  enablePWA: true,
};

export default CONFIG;
