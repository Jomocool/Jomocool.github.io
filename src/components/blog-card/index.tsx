import { useEffect, useState } from 'react';
import { PiNewspaper } from 'react-icons/pi';
import { HiArrowLeft, HiChevronRight, HiFolder } from 'react-icons/hi';
import { getDevPost, getMediumPost } from '@arifszn/blog-js';
import { formatDistance } from 'date-fns';
import {
  SanitizedArticleSeries,
  SanitizedBlog,
  SanitizedLocalArticle,
} from '../../interfaces/sanitized-config';
import {
  ga,
  getArticleHash,
  getSeriesHash,
  getSeriesIdFromHash,
  skeleton,
} from '../../utils';
import { Article } from '../../interfaces/article';

const BlogCard = ({
  loading,
  blog,
  googleAnalyticsId,
}: {
  loading: boolean;
  blog: SanitizedBlog;
  googleAnalyticsId?: string;
}) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [seriesId, setSeriesId] = useState<string | null>(() =>
    getSeriesIdFromHash(window.location.hash),
  );

  useEffect(() => {
    if (blog.source === 'medium') {
      getMediumPost({
        user: blog.username,
      }).then((res) => {
        setArticles(res);
      });
    } else if (blog.source === 'dev') {
      getDevPost({
        user: blog.username,
      }).then((res) => {
        setArticles(res);
      });
    } else if (blog.source === 'local') {
      setArticles(
        blog.articles.map((item) => ({
          title: item.title,
          thumbnail: item.thumbnail,
          link: getArticleHash(item.file),
          publishedAt: item.publishedAt
            ? new Date(`${item.publishedAt}T00:00:00`)
            : new Date(),
          description: item.description,
          categories: item.categories,
        })),
      );
    }
  }, [blog]);

  useEffect(() => {
    const onHashChange = () => {
      setSeriesId(getSeriesIdFromHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const directories = groupDirectories(blog);
  const openDirectory = directories.find((item) => item.series.id === seriesId);
  const useDirectories = blog.source === 'local' && directories.length > 0;

  const openArticle = (title: string, link: string) => {
    try {
      if (googleAnalyticsId) {
        ga.event('Click Blog Post', {
          post: title,
        });
      }
    } catch (error) {
      console.error(error);
    }

    if (!link.startsWith('#')) {
      window?.open(link, '_blank');
    }
  };

  const renderSkeleton = () => {
    const array = [];
    for (let index = 0; index < 3; index++) {
      array.push(
        <div className="card shadow-md card-sm bg-base-100" key={index}>
          <div className="p-8 h-full w-full">
            <div className="flex items-center flex-col md:flex-row">
              <div className="avatar mb-5 md:mb-0">
                <div className="w-24 h-24 mask mask-squircle">
                  {skeleton({
                    widthCls: 'w-full',
                    heightCls: 'h-full',
                    shape: '',
                  })}
                </div>
              </div>
              <div className="w-full">
                <div className="flex items-start px-4">
                  <div className="w-full">
                    <h2>
                      {skeleton({
                        widthCls: 'w-full',
                        heightCls: 'h-8',
                        className: 'mb-2 mx-auto md:mx-0',
                      })}
                    </h2>
                    {skeleton({
                      widthCls: 'w-24',
                      heightCls: 'h-3',
                      className: 'mx-auto md:mx-0',
                    })}
                    <div className="mt-3">
                      {skeleton({
                        widthCls: 'w-full',
                        heightCls: 'h-4',
                        className: 'mx-auto md:mx-0',
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
      );
    }

    return array;
  };

  const renderArticleLink = (article: Article, index: number) => (
    <a
      className="card shadow-md card-sm bg-base-100 cursor-pointer"
      key={index}
      href={article.link}
      onClick={() => openArticle(article.title, article.link)}
    >
      <div className="p-5 h-full w-full">
        <div className="text-center md:text-left w-full">
          <h2 className="font-medium text-base-content opacity-60">
            {article.title}
          </h2>
          <p className="text-base-content opacity-50 text-xs mt-1">
            {formatDistance(article.publishedAt, new Date(), {
              addSuffix: true,
            })}
          </p>
          {article.description && (
            <p className="mt-2 text-base-content text-sm">{article.description}</p>
          )}
          {article.categories.length > 0 && (
            <div className="mt-3 flex items-center flex-wrap justify-center md:justify-start">
              {article.categories.map((category, index2) => (
                <div
                  className="py-2 px-4 text-xs leading-3 rounded-full bg-base-300 mr-1 mb-1 opacity-50 text-base-content"
                  key={index2}
                >
                  #{category}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </a>
  );

  const renderFlatArticles = () => {
    return articles && articles.length ? (
      articles.map((article, index) => renderArticleLink(article, index))
    ) : (
      <div className="text-center mb-6">
        <PiNewspaper className="mx-auto h-12 w-12 opacity-30" />
        <p className="mt-1 text-sm opacity-50 text-base-content">还没有文章</p>
      </div>
    );
  };

  const renderDirectories = () => (
    <div className="grid grid-cols-1 gap-3">
      {directories.map((directory) => (
        <button
          key={directory.series.id}
          type="button"
          className="card shadow-md card-sm bg-base-100 cursor-pointer text-left"
          onClick={() => {
            window.location.hash = getSeriesHash(directory.series.id);
          }}
        >
          <div className="p-5 flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl shrink-0">
              <HiFolder className="text-2xl" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-medium text-base-content">{directory.series.title}</h2>
                <span className="text-xs opacity-50 shrink-0">
                  {directory.articles.length} 篇
                </span>
              </div>
              {directory.series.description && (
                <p className="mt-1 text-sm text-base-content/70">
                  {directory.series.description}
                </p>
              )}
            </div>
            <HiChevronRight className="text-xl opacity-40 shrink-0" />
          </div>
        </button>
      ))}
    </div>
  );

  const renderOpenDirectory = (directory: {
    series: SanitizedArticleSeries;
    articles: SanitizedLocalArticle[];
  }) => (
    <div className="grid grid-cols-1 gap-3">
      <button
        type="button"
        className="btn btn-ghost btn-sm justify-start gap-2 w-fit"
        onClick={() => {
          window.location.hash = '';
        }}
      >
        <HiArrowLeft />
        全部目录
      </button>
      {directory.articles.map((item, index) =>
        renderArticleLink(
          {
            title: item.title,
            thumbnail: item.thumbnail,
            link: getArticleHash(item.file),
            publishedAt: item.publishedAt
              ? new Date(`${item.publishedAt}T00:00:00`)
              : new Date(),
            description: item.description,
            categories: item.categories,
          },
          index,
        ),
      )}
    </div>
  );

  const subtitle = openDirectory
    ? openDirectory.series.description || `${openDirectory.articles.length} 篇`
    : useDirectories
      ? '按系列查看'
      : '技术笔记';

  return (
    <div className="col-span-1 lg:col-span-2">
      <div className="card bg-base-200 shadow-xl border border-base-300">
        <div className="card-body p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div className="flex items-center space-x-3">
              {loading ? (
                skeleton({
                  widthCls: 'w-12',
                  heightCls: 'h-12',
                  className: 'rounded-xl',
                })
              ) : (
                <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl">
                  <PiNewspaper className="text-2xl" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-bold text-base-content truncate">
                  {loading
                    ? skeleton({ widthCls: 'w-28', heightCls: 'h-8' })
                    : openDirectory
                      ? openDirectory.series.title
                      : '文章'}
                </h3>
                <div className="text-base-content/60 text-xs sm:text-sm mt-1 truncate">
                  {loading
                    ? skeleton({ widthCls: 'w-32', heightCls: 'h-4' })
                    : subtitle}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6">
            {loading || (!useDirectories && !articles)
              ? renderSkeleton()
              : useDirectories
                ? openDirectory
                  ? renderOpenDirectory(openDirectory)
                  : renderDirectories()
                : renderFlatArticles()}
          </div>
        </div>
      </div>
    </div>
  );
};

const groupDirectories = (
  blog: SanitizedBlog,
): Array<{ series: SanitizedArticleSeries; articles: SanitizedLocalArticle[] }> => {
  if (blog.source !== 'local') {
    return [];
  }

  const grouped = new Map<string, SanitizedLocalArticle[]>();
  for (const article of blog.articles) {
    const id = article.series || 'other';
    const items = grouped.get(id) || [];
    items.push(article);
    grouped.set(id, items);
  }

  const ordered: Array<{
    series: SanitizedArticleSeries;
    articles: SanitizedLocalArticle[];
  }> = [];

  for (const series of blog.series) {
    const items = grouped.get(series.id);
    if (!items?.length) {
      continue;
    }
    ordered.push({ series, articles: items });
    grouped.delete(series.id);
  }

  for (const [id, items] of grouped) {
    ordered.push({
      series: {
        id,
        title: id === 'other' ? '其他' : id,
        description: '',
      },
      articles: items,
    });
  }

  return ordered;
};

export default BlogCard;
