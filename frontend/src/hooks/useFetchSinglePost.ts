import { useState, useEffect } from 'react';
import { PostData } from '@/components/post/Post';
import { apiJson } from '@/utils/api';

interface ApiResponse {
  success: boolean;
  data: PostData | PostData[];
}

export const useFetchSinglePost = (postId: string) => {
  const [post, setPost] = useState<PostData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const responseData: ApiResponse = await apiJson<PostData | PostData[]>(
          `/api/v1/posts/${postId}`
        ) as ApiResponse;
        const postData = Array.isArray(responseData.data)
          ? responseData.data[0]
          : responseData.data;
        setPost(postData || null);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPosts();
  }, [postId]);

  return { post, setPost, isLoading, error };
};
