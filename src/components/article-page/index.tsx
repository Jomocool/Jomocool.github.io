import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HiArrowLeft } from 'react-icons/hi';
import { SanitizedLocalArticle } from '../../interfaces/sanitized-config';
import { BG_COLOR } from '../../constants';
import { getArticleAssetUrl, skeleton } from '../../utils';

const ArticlePage = ({
  article,
  onBack,
}: {
  article: SanitizedLocalArticle;
  onBack: () => void;
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setContent('');

      try {
        const response = await fetch(getArticleAssetUrl(article.file));
        if (!response.ok) {
          throw new Error(`Failed to load article (${response.status})`);
        }
        const text = await response.text();
        if (!cancelled) {
          setContent(text);
        }
      } catch {
        if (!cancelled) {
          setError('文章加载失败，请稍后重试。');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    window.scrollTo(0, 0);

    return () => {
      cancelled = true;
    };
  }, [article.file]);

  return (
    <div className={`p-4 lg:p-10 min-h-full ${BG_COLOR}`}>
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          className="btn btn-ghost btn-sm mb-4 gap-2"
          onClick={onBack}
        >
          <HiArrowLeft />
          返回
        </button>
        <div className="card bg-base-100 shadow-xl border border-base-300">
          <div className="card-body p-6 sm:p-8 lg:p-10">
            {article.publishedAt && (
              <p className="text-sm opacity-50 mb-2">{article.publishedAt}</p>
            )}
            {loading ? (
              <div className="space-y-4">
                {skeleton({
                  widthCls: 'w-2/3',
                  heightCls: 'h-10',
                  shape: 'rounded-lg',
                })}
                {skeleton({
                  widthCls: 'w-full',
                  heightCls: 'h-4',
                  shape: 'rounded-lg',
                })}
                {skeleton({
                  widthCls: 'w-full',
                  heightCls: 'h-4',
                  shape: 'rounded-lg',
                })}
                {skeleton({
                  widthCls: 'w-5/6',
                  heightCls: 'h-4',
                  shape: 'rounded-lg',
                })}
              </div>
            ) : error ? (
              <p className="text-error">{error}</p>
            ) : (
              <div className="article-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArticlePage;
