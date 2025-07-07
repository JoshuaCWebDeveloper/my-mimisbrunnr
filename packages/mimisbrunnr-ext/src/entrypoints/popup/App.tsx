import React, { useEffect, useState } from 'react';
import './App.css';

interface UserTag {
    username: string;
    tag: string;
    color: string;
}

const defaultColor = '#0074D9';

function sendMessage<T = unknown>(message: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        // Support both browser and chrome APIs
        const runtime = window.browser?.runtime || window.chrome?.runtime;
        if (!runtime) return reject(new Error('No runtime API available'));
        runtime.sendMessage(message, (response: unknown) => {
            if (runtime.lastError) {
                reject(runtime.lastError);
            } else {
                resolve(response as T);
            }
        });
    });
}

function App() {
    const [tags, setTags] = useState<UserTag[]>([]);
    const [form, setForm] = useState<Partial<UserTag>>({ color: defaultColor });
    const [editing, setEditing] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOnX, setIsOnX] = useState<boolean | null>(null);

    const checkIfOnX = async () => {
        try {
            const tabs = await new Promise<Array<{ url?: string }>>(resolve => {
                const runtime = window.browser?.tabs || window.chrome?.tabs;
                if (runtime) {
                    runtime.query(
                        { active: true, currentWindow: true },
                        resolve
                    );
                } else {
                    resolve([]);
                }
            });

            const currentTab = tabs[0];
            const isX = Boolean(
                currentTab?.url?.includes('twitter.com') ||
                    currentTab?.url?.includes('x.com')
            );
            setIsOnX(isX);

            if (isX) {
                fetchTags();
            }
        } catch (_e) {
            setIsOnX(false);
        }
    };

    const fetchTags = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await sendMessage<{ tags: UserTag[] }>({
                type: 'GET_TAGS',
            });
            setTags(res.tags);
        } catch (e: unknown) {
            setError((e as Error).message || 'Failed to fetch tags');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkIfOnX();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.username || !form.tag || !form.color) return;
        setLoading(true);
        setError(null);
        try {
            await sendMessage({
                type: 'SAVE_TAG',
                username: form.username.trim().toLowerCase(),
                tag: form.tag,
                color: form.color,
            });
            setForm({ color: defaultColor });
            setEditing(null);
            fetchTags();
        } catch (e: unknown) {
            setError((e as Error).message || 'Failed to save tag');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (tag: UserTag) => {
        setForm(tag);
        setEditing(tag.username);
    };

    const handleDelete = async (username: string, tag: string) => {
        setLoading(true);
        setError(null);
        try {
            await sendMessage({ type: 'DELETE_TAG', username, tag });
            fetchTags();
        } catch (e: unknown) {
            setError((e as Error).message || 'Failed to delete tag');
        } finally {
            setLoading(false);
        }
    };

    if (isOnX === null) {
        return <div className="container">Loading...</div>;
    }

    if (!isOnX) {
        return (
            <div className="container">
                <h2>X.com Account Tags</h2>
                <p>
                    Please navigate to X.com (twitter.com or x.com) to manage
                    your account tags.
                </p>
            </div>
        );
    }

    return (
        <div className="container">
            <h2>X.com Account Tags</h2>
            <form onSubmit={handleSubmit} className="tag-form">
                <input
                    name="username"
                    placeholder="Username"
                    value={form.username || ''}
                    onChange={handleChange}
                    disabled={loading}
                    required
                />
                <input
                    name="tag"
                    placeholder="Tag"
                    value={form.tag || ''}
                    onChange={handleChange}
                    disabled={loading}
                    required
                />
                <input
                    name="color"
                    type="color"
                    value={form.color || defaultColor}
                    onChange={handleChange}
                    disabled={loading}
                />
                <button type="submit" disabled={loading}>
                    {editing ? 'Update' : 'Add'}
                </button>
                {editing && (
                    <button
                        type="button"
                        onClick={() => {
                            setForm({ color: defaultColor });
                            setEditing(null);
                        }}
                        disabled={loading}
                    >
                        Cancel
                    </button>
                )}
            </form>
            {error && <div className="error">{error}</div>}
            <div className="tag-list">
                {loading ? (
                    <div>Loading...</div>
                ) : tags.length === 0 ? (
                    <div>No tags yet.</div>
                ) : (
                    <ul>
                        {tags.map(t => (
                            <li key={t.username}>
                                <span className="username">@{t.username}</span>
                                <span
                                    className="tag-badge"
                                    style={{
                                        backgroundColor: t.color,
                                        color: '#fff',
                                        marginLeft: 8,
                                        padding: '2px 8px',
                                        borderRadius: 8,
                                    }}
                                >
                                    {t.tag}
                                </span>
                                <button
                                    onClick={() => handleEdit(t)}
                                    disabled={loading}
                                    style={{ marginLeft: 8 }}
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() =>
                                        handleDelete(t.username, t.tag)
                                    }
                                    disabled={loading}
                                    style={{ marginLeft: 4 }}
                                >
                                    Delete
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default App;
