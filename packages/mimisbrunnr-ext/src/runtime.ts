export const getRuntime = () => {
    // Support both browser and chrome APIs
    const runtime = browser?.runtime || window.chrome?.runtime;

    if (!runtime) {
        throw new Error('No runtime API available');
    }

    return runtime;
};

export const getTabs = () => {
    const tabsInterface = browser?.tabs || window.chrome?.tabs;

    if (!tabsInterface) {
        throw new Error('No tabs API available');
    }

    return tabsInterface;
};
