import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessengerProvider } from './messenger.js';
import { TagManagerProvider } from './tag-manager.js';

const queryClient = new QueryClient();

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
    return (
        <QueryClientProvider client={queryClient}>
            <MessengerProvider>
                <TagManagerProvider>{children}</TagManagerProvider>
            </MessengerProvider>
        </QueryClientProvider>
    );
};
