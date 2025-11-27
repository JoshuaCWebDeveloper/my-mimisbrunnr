import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTagManager } from '../context/tag-manager.js';

const listTagsQueryKey = ['tags'];

export const useListTags = () => {
    const tagManager = useTagManager();
    return useQuery({
        queryKey: listTagsQueryKey,
        queryFn: () => tagManager.list(),
    });
};

export const useInvalidateListTags = () => {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: listTagsQueryKey });
};
