import { apiUrl } from "./api";

export const postService = {
    async getPostTitleById(postId: string): Promise<string> {
        const response = await fetch(apiUrl(`/api/v1/posts/${postId}`));
        if (!response.ok) {
            throw new Error("Failed to fetch post title");
        }
        const data = await response.json();
        return data.data.title;
    }
}
