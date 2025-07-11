import { createContext, useContext, useRef } from 'react';
import { Messenger } from '../../../../messenger.js';

export const MessengerContext = createContext<Messenger | null>(null);

export const MessengerProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const messenger = useRef(new Messenger());
    return (
        <MessengerContext.Provider value={messenger.current}>
            {children}
        </MessengerContext.Provider>
    );
};

export const useMessenger = () => {
    const messenger = useContext(MessengerContext);

    if (!messenger) {
        throw new Error('useMessenger must be used within a MessengerProvider');
    }

    return messenger;
};
