import React from 'react';
import { Provider, useSelector } from 'react-redux';
import { createSlice, configureStore } from '@reduxjs/toolkit';
import { ethers } from 'ethers';
import RunnerNarrativeABI from './RunnerNarrative.js';
import ERC20 from './ERC20.js';
import { OnboardingButton } from './Onboarding.js';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import './App.css';

const RUNNER_NARRATIVE_ADDRESS = '0x40632f44E5CF7F7A229F4b0c018282fad8534ede';

const slice = createSlice({
    name: 'bio-runner',
    initialState: {
        connected: false,
        address: null,
        narrativeContract: null,
        runnerId: null,
        runner: null,
        isSaving: false,
    },
    reducers: {
        connected: (state, action) => {
            state.connected = true;
            state.address = action.payload.address;
            state.narrativeContract = action.payload.narrativeContract;
            state.dataContract = action.payload.dataContract;
            state.onConnect = true;
        },
        connectFinished: (state, action) => {
            state.onConnect = false;
        },
        setCost: (state, action) => {
            state.cost = action.payload.cost;
        },
        setRunnerId: (state, action) => {
            state.runnerId = action.payload.runnerId;
            if (state.runnerId !== state.runner?.id) {
                state.runner = null;
            }
        },
        setRunner: (state, action) => {
            state.runner = action.payload.runner;
        },
        setPendingNarrative: (state, action) => {
            state.pendingNarrative = action.payload.narrative;
        },
        saving: (state, action) => {
            state.isSaving = action.payload;
        },
        transactionStarted: (state, action) => {
            state.tx = {
                hash: action.payload.hash,
            };
        },
        transactionConfirmed: (state, action) => {
            state.tx = null;
            state.runner.narrative = state.pendingNarrative;
            state.pendingNarrative = null;
        },
        transactionFailed: (state, action) => {
            if (!state.tx) {
                state.tx = {};
            }
            state.tx.error = action.payload.error;
        },
    },
});

const {
    connected, connectFinished,
    setRunnerId, setRunner, setCost,
    setPendingNarrative,
    saving,
    transactionStarted, transactionConfirmed, transactionFailed,
} = slice.actions;
const store = configureStore({
    reducer: slice.reducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                ignoredActionPaths: [
                    'payload.narrativeContract',
                    'payload.dataContract',
                    'payload.cost',
                ],
                ignoredPaths: [
                    'narrativeContract',
                    'dataContract',
                    'cost',
                ],
            },
        }),
});

const selectNarrativeContract = state => state.narrativeContract;
const selectDataContract = state => state.dataContract;
const selectCost = state => state.cost;
const selectRunnerId = state => state.runnerId;
const selectRunner = state => state.runner;
const selectAddress = state => state.address;
const selectIsOwner = state => (state.address === state.runner?.owner);
const selectIsPendingTransaction = state => (state.tx && !state.tx.error);
const selectPendingTxHash = state => state.tx?.hash;
const selectTxError = state => state.tx?.error;
const selectIsSaving = state => state.isSaving;

store.subscribe(() => {
    const { narrativeContract, onConnect, runnerId, runner } = store.getState();
    if (onConnect) {
        store.dispatch(connectFinished());
        narrativeContract.cost().then(cost => store.dispatch(setCost({ cost })));
    }
    if (runnerId && (runnerId !== runner?.id)) {
        fetch(`https://2112-api.sirsean.workers.dev/runner/${runnerId}`)
            .then(r => r.json())
            .then(runner => {
                console.log(runner);
                store.dispatch(setRunner({ runner }));
            });
    }
});

const onConnected = async () => {
    console.log('onConnected');
    // Use the MetaMask wallet as ethers provider
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const address = await provider.listAccounts().then(accounts => accounts[0]);

    const narrativeContract = new ethers.Contract(
        RUNNER_NARRATIVE_ADDRESS,
        RunnerNarrativeABI,
        provider.getSigner()
    );

    await narrativeContract.data().then(dataAddr => {
        return new ethers.Contract(dataAddr, ERC20, provider.getSigner());
    }).then(dataContract => {
        store.dispatch(connected({narrativeContract, dataContract, address}));
    });
}

function SearchBar() {
    const search = (e) => {
        e.preventDefault();
        const runnerId = e.target.runnerId.value;
        store.dispatch(setRunnerId({ runnerId }));
    };
    return (
        <div className="SearchBar">
            <form onSubmit={search}>
                <input type="text" name="runnerId" tabIndex="1" />
                <button>Search</button>
            </form>
        </div>
    );
}

function runnerTitle(runner) {
    const talent = runner.attributes.Talent;
    const faction = runner.attributes.Faction.replace(/The /, '').replace(/s$/, '');
    return `T${talent} ${faction}`;
}

function AttrRow(props) {
    return (
        <div className="AttrRow">
            <span className="name">{props.name}::</span>
            <span className="value">{props.value}</span>
        </div>
    );
}

function SanitizedNarrative(props) {
    if (props.narrative) {
        const sanitized = { __html: sanitizeHtml(marked.parse(props.narrative)) };
        return (
            <div className="SanitizedNarrative" dangerouslySetInnerHTML={sanitized} />
        );
    }
}

function Runner() {
    const runner = useSelector(selectRunner);
    if (runner) {
        const title = runnerTitle(runner);
        const attrs = Object.assign({}, runner.attributes);
        const notoriety = attrs['Notoriety Points'];
        ['Faction', 'Talent', 'Notoriety Points'].forEach(k => delete attrs[k]);
        return (
            <div className="Runner">
                <h2>{title}</h2>
                <div className="row">
                    <div className="owner">
                        OWNER:: {runner.owner}
                    </div>
                </div>
                <div className="row">
                    <div className="left">
                        <div className="imgWrapper">
                            <img className="runner" src={runner.image} alt={runner.name} />
                        </div>
                    </div>
                    <div className="right">
                        <AttrRow name="Notoriety Points" value={notoriety} />
                        {Object.keys(attrs).map(k => <AttrRow key={k} name={k} value={attrs[k]} />)}
                    </div>
                </div>
                {runner.narrative &&
                    <div className="row">
                        <SanitizedNarrative narrative={runner.narrative} />
                    </div>}
                <NarrativeForm />
                <PendingTransaction />
                <TransactionFailed />
            </div>
        );
    }
}

function NarrativeForm() {
    const isOwner = useSelector(selectIsOwner);
    const runnerId = useSelector(selectRunnerId);
    const runner = useSelector(selectRunner);
    const narrative = runner?.narrative;
    const narrativeContract = useSelector(selectNarrativeContract);
    const dataContract = useSelector(selectDataContract);
    const cost = useSelector(selectCost);
    const isSaving = useSelector(selectIsSaving);
    const submit = async (e) => {
        e.preventDefault();
        const { timestamp, signature } = await fetch(`https://2112signer.sirsean.workers.dev/runner/${runnerId}`).then(r => r.json());
        const story = e.target.narrative.value;
        if (story === narrative) {
            return;
        }
        store.dispatch(saving(true));
        if (cost.gt(ethers.constants.Zero)) {
            await dataContract.approve(narrativeContract.address, cost)
                .then(tx => {
                    store.dispatch(transactionStarted({ hash: tx.hash }));
                    return tx.wait();
                }).then(receipt => {
                    if (receipt.status === 0) {
                        store.dispatch(transactionFailed({ error: 'Transaction Failed' }));
                    } else {
                        store.dispatch(transactionConfirmed());
                    }
                }).catch(e => {
                    store.dispatch(transactionFailed({ error: e.message }));
                });
        }
        store.dispatch(setPendingNarrative({ narrative: story }));
        narrativeContract.setNarrative(runnerId, story, timestamp, signature)
            .then(tx => {
                console.log(tx);
                store.dispatch(transactionStarted({ hash: tx.hash }));
                return tx.wait();
            }).then(receipt => {
                if (receipt.status === 0) {
                    store.dispatch(transactionFailed({ error: 'Transaction Failed' }));
                } else {
                    store.dispatch(transactionConfirmed());
                    store.dispatch(saving(false));
                }
            }).catch(e => {
                store.dispatch(transactionFailed({ error: e.message }));
                store.dispatch(saving(false));
            });
    };
    if (isOwner && !isSaving) {
        const polygonScanLink = `https://polygonscan.com/address/${RUNNER_NARRATIVE_ADDRESS}`;
        return (
            <div className="NarrativeForm">
                <form onSubmit={submit}>
                    <textarea name="narrative" rows="8" tabIndex="2" defaultValue={narrative || ''}></textarea>
                    <button>Save</button>
                </form>
            <p>This will store your runner's narrative to the blockchain, where it will safely stay until you overwrite it.</p>
            <p>You should know that this is Markdown.</p>
            {cost && cost.gt(ethers.constants.Zero) &&
                <div>
                    <p>Before we can send that transaction, you must first approve the contract to take some DATA from your wallet.</p>
                    <p>Then we will submit a second transaction that includes your runner's new narrative.</p>
                </div>}
            {cost && !cost.gt(ethers.constants.Zero) &&
                    <p>We will submit a transaction that includes your runner's new narrative.</p>}
                <p><a href={polygonScanLink} target="_blank" rel="noreferrer">Inspect the contract on Polygonscan.</a></p>
            </div>
        );
    }
}

function PendingTransaction() {
    const isPendingTransaction = useSelector(selectIsPendingTransaction);
    const txHash = useSelector(selectPendingTxHash);
    if (isPendingTransaction) {
        const href = `https://polygonscan.com/tx/${txHash}`;
        return (
            <div className="PendingTransaction">
                waiting for <a target="_blank" rel="noreferrer" href={href}>transaction</a>
            </div>
        );
    }
}

function TransactionFailed() {
    const txError = useSelector(selectTxError);
    if (txError) {
        return (
            <div className="TransactionFailed">
                {txError}
            </div>
        );
    }
}

function Main() {
    return (
        <div className="Main">
            <OnboardingButton onConnected={onConnected} />
            <div className="row">
                <div className="col">
                    <SearchBar />
                </div>
                <div className="col">
                    <Runner />
                </div>
            </div>
        </div>
    );
}

function Header() {
    const address = useSelector(selectAddress);
    const cost = useSelector(selectCost);
    return (
        <header>
            <div className="left"><h1>bio-runner</h1></div>
            <div className="right">
                <span>{address}</span>
                {cost && <span>Cost to set bio: {ethers.utils.formatUnits(cost, 18)} DATA</span>}
            </div>
        </header>
    );
}

function App() {
    return (
        <Provider store={store}>
            <div className="App">
                <Header />
                <Main />
            </div>
        </Provider>
    );
}

export default App;
