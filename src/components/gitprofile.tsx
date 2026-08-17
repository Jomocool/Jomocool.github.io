import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CustomError, INVALID_CONFIG_ERROR } from '../constants/errors';
import '../assets/index.css';
import {
  getArticleFileFromHash,
  getFallbackProfile,
  getGithubApiHeaders,
  getInitialTheme,
  getSanitizedConfig,
  isCachedProfileFresh,
  readCachedProfile,
  setupHotjar,
  writeCachedProfile,
} from '../utils';
import { SanitizedConfig } from '../interfaces/sanitized-config';
import ErrorPage from './error-page';
import { DEFAULT_THEMES } from '../constants/default-themes';
import ThemeChanger from './theme-changer';
import { BG_COLOR } from '../constants';
import AvatarCard from './avatar-card';
import { Profile } from '../interfaces/profile';
import DetailsCard from './details-card';
import SkillCard from './skill-card';
import ExperienceCard from './experience-card';
import EducationCard from './education-card';
import CertificationCard from './certification-card';
import { GithubProject } from '../interfaces/github-project';
import GithubProjectCard from './github-project-card';
import ExternalProjectCard from './external-project-card';
import BlogCard from './blog-card';
import Footer from './footer';
import PublicationCard from './publication-card';
import ArticlePage from './article-page';

/**
 * Renders the GitProfile component.
 *
 * @param {Object} config - the configuration object
 * @return {JSX.Element} the rendered GitProfile component
 */
const GitProfile = ({ config }: { config: Config }) => {
  const [sanitizedConfig] = useState<SanitizedConfig | Record<string, never>>(
    getSanitizedConfig(config),
  );
  const [theme, setTheme] = useState<string>(DEFAULT_THEMES[0]);
  const [error, setError] = useState<CustomError | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [profile, setProfile] = useState<Profile | null>(() => {
    const username = sanitizedConfig.github?.username;
    if (!username) {
      return null;
    }

    return readCachedProfile(username) || getFallbackProfile(username);
  });
  const [githubProjects, setGithubProjects] = useState<GithubProject[]>([]);
  const [articleFile, setArticleFile] = useState<string | null>(
    getArticleFileFromHash(window.location.hash),
  );

  const getGithubProjects = useCallback(
    async (publicRepoCount: number): Promise<GithubProject[]> => {
      if (sanitizedConfig.projects.github.mode === 'automatic') {
        if (publicRepoCount === 0) {
          return [];
        }

        const excludeRepo =
          sanitizedConfig.projects.github.automatic.exclude.projects
            .map((project) => `+-repo:${project}`)
            .join('');

        const query = `user:${sanitizedConfig.github.username}+fork:${!sanitizedConfig.projects.github.automatic.exclude.forks}${excludeRepo}`;
        const url = `https://api.github.com/search/repositories?q=${query}&sort=${sanitizedConfig.projects.github.automatic.sortBy}&per_page=${sanitizedConfig.projects.github.automatic.limit}&type=Repositories`;

        const repoResponse = await axios.get(url, {
          headers: getGithubApiHeaders(),
        });
        const repoData = repoResponse.data;

        return repoData.items;
      } else {
        if (sanitizedConfig.projects.github.manual.projects.length === 0) {
          return [];
        }
        const repos = sanitizedConfig.projects.github.manual.projects
          .map((project) => `+repo:${project}`)
          .join('');

        const url = `https://api.github.com/search/repositories?q=${repos}+fork:true&type=Repositories`;

        const repoResponse = await axios.get(url, {
          headers: getGithubApiHeaders(),
        });
        const repoData = repoResponse.data;

        return repoData.items;
      }
    },
    [
      sanitizedConfig.github.username,
      sanitizedConfig.projects.github.mode,
      sanitizedConfig.projects.github.manual.projects,
      sanitizedConfig.projects.github.automatic.sortBy,
      sanitizedConfig.projects.github.automatic.limit,
      sanitizedConfig.projects.github.automatic.exclude.forks,
      sanitizedConfig.projects.github.automatic.exclude.projects,
    ],
  );

  const loadData = useCallback(async () => {
    const username = sanitizedConfig.github.username;
    const cachedProfile = readCachedProfile(username);
    const fallbackProfile = getFallbackProfile(username);

    setProfile(cachedProfile || fallbackProfile);

    if (cachedProfile && isCachedProfileFresh(username)) {
      return;
    }

    try {
      setLoading(!cachedProfile);

      const response = await axios.get(
        `https://api.github.com/users/${username}`,
        { headers: getGithubApiHeaders() },
      );
      const data = response.data;
      const nextProfile: Profile = {
        avatar: data.avatar_url,
        name: data.name || username,
        bio: data.bio || '',
        location: data.location || '',
        company: data.company || '',
      };

      setProfile(nextProfile);
      writeCachedProfile(username, nextProfile);

      if (!sanitizedConfig.projects.github.display) {
        return;
      }

      setGithubProjects(await getGithubProjects(data.public_repos));
    } catch (requestError) {
      console.error('GitHub profile request failed:', requestError);
      setProfile(cachedProfile || fallbackProfile);
    } finally {
      setLoading(false);
    }
  }, [
    sanitizedConfig.github.username,
    sanitizedConfig.projects.github.display,
    getGithubProjects,
  ]);

  useEffect(() => {
    if (Object.keys(sanitizedConfig).length === 0) {
      setError(INVALID_CONFIG_ERROR);
    } else {
      setError(null);
      setTheme(getInitialTheme(sanitizedConfig.themeConfig));
      setupHotjar(sanitizedConfig.hotjar);
      loadData();
    }
  }, [sanitizedConfig, loadData]);

  useEffect(() => {
    theme && document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onHashChange = () => {
      setArticleFile(getArticleFileFromHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const selectedArticle =
    articleFile && sanitizedConfig.blog
      ? sanitizedConfig.blog.articles.find((item) => item.file === articleFile)
      : undefined;

  return (
    <div className="fade-in h-screen">
      {error ? (
        <ErrorPage
          status={error.status}
          title={error.title}
          subTitle={error.subTitle}
        />
      ) : selectedArticle ? (
        <ArticlePage
          article={selectedArticle}
          onBack={() => {
            window.location.hash = '';
          }}
        />
      ) : (
        <>
          <div className={`p-4 lg:p-10 min-h-full ${BG_COLOR}`}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 rounded-box">
              <div className="col-span-1">
                <div className="grid grid-cols-1 gap-6">
                  {!sanitizedConfig.themeConfig.disableSwitch && (
                    <ThemeChanger
                      theme={theme}
                      setTheme={setTheme}
                      loading={loading}
                      themeConfig={sanitizedConfig.themeConfig}
                    />
                  )}
                  <AvatarCard
                    profile={profile}
                    loading={loading}
                    avatarRing={sanitizedConfig.themeConfig.displayAvatarRing}
                    resumeFileUrl={sanitizedConfig.resume.fileUrl}
                  />
                  <DetailsCard
                    profile={profile}
                    loading={loading}
                    github={sanitizedConfig.github}
                    social={sanitizedConfig.social}
                  />
                  {sanitizedConfig.skills.length !== 0 && (
                    <SkillCard
                      loading={loading}
                      skills={sanitizedConfig.skills}
                    />
                  )}
                  {sanitizedConfig.experiences.length !== 0 && (
                    <ExperienceCard
                      loading={loading}
                      experiences={sanitizedConfig.experiences}
                    />
                  )}
                  {sanitizedConfig.certifications.length !== 0 && (
                    <CertificationCard
                      loading={loading}
                      certifications={sanitizedConfig.certifications}
                    />
                  )}
                  {sanitizedConfig.educations.length !== 0 && (
                    <EducationCard
                      loading={loading}
                      educations={sanitizedConfig.educations}
                    />
                  )}
                </div>
              </div>
              <div className="lg:col-span-2 col-span-1">
                <div className="grid grid-cols-1 gap-6">
                  {sanitizedConfig.projects.github.display && (
                    <GithubProjectCard
                      header={sanitizedConfig.projects.github.header}
                      limit={sanitizedConfig.projects.github.automatic.limit}
                      githubProjects={githubProjects}
                      loading={loading}
                      googleAnalyticsId={sanitizedConfig.googleAnalytics.id}
                    />
                  )}
                  {sanitizedConfig.publications.length !== 0 && (
                    <PublicationCard
                      loading={loading}
                      publications={sanitizedConfig.publications}
                    />
                  )}
                  {sanitizedConfig.projects.external.projects.length !== 0 && (
                    <ExternalProjectCard
                      loading={loading}
                      header={sanitizedConfig.projects.external.header}
                      externalProjects={
                        sanitizedConfig.projects.external.projects
                      }
                      googleAnalyticId={sanitizedConfig.googleAnalytics.id}
                    />
                  )}
                  {sanitizedConfig.blog.display && (
                    <BlogCard
                      loading={loading}
                      googleAnalyticsId={sanitizedConfig.googleAnalytics.id}
                      blog={sanitizedConfig.blog}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
          {sanitizedConfig.footer && (
            <footer
              className={`p-4 footer ${BG_COLOR} text-base-content footer-center`}
            >
              <div className="card card-sm bg-base-100 shadow-sm">
                <Footer content={sanitizedConfig.footer} loading={loading} />
              </div>
            </footer>
          )}
        </>
      )}
    </div>
  );
};

export default GitProfile;
