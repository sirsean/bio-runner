import React from 'react';
import { Provider, useSelector } from 'react-redux';
import { createSlice, configureStore } from '@reduxjs/toolkit';
import { ethers } from 'ethers';
import RunnerNarrativeABI from './RunnerNarrative.js';
import ERC20 from './ERC20.js';
import { OnboardingButton } from './Onboarding.js';
import './App.css';

const RUNNER_NARRATIVE_ADDRESS = '0x40632f44E5CF7F7A229F4b0c018282fad8534ede';

const slice = createSlice({
    name: 'bio-runner',
    initialState: {
        connected: false,
        address: null,
        narrativeContract: null,
        runnerId: null,
        runnerSig: null,
        currentNarrative: null,
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
        },
        setRunnerSig: (state, action) => {
            state.runnerSig = action.payload.runnerSig;
        },
        setCurrentNarrative: (state, action) => {
            state.currentNarrative = action.payload.narrative;
        },
        setPendingNarrative: (state, action) => {
            state.pendingNarrative = action.payload.narrative;
        },
        transactionStarted: (state, action) => {
            state.tx = {
                hash: action.payload.hash,
            };
        },
        transactionConfirmed: (state, action) => {
            state.tx = null;
            state.currentNarrative = state.pendingNarrative;
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
    setRunnerId, setRunnerSig, setCost,
    setCurrentNarrative, setPendingNarrative,
    transactionStarted, transactionConfirmed, transactionFailed,
} = slice.actions;
const store = configureStore({
    reducer: slice.reducer,
});

const selectNarrativeContract = state => state.narrativeContract;
const selectDataContract = state => state.dataContract;
const selectCost = state => state.cost;
const selectRunnerId = state => state.runnerId;
const selectAddress = state => state.address;
const selectRunnerSig = state => state.runnerSig;
const selectIsOwner = state => (state.address === state.runnerSig?.owner);
const selectCurrentNarrative = state => state.currentNarrative;
const selectIsPendingTransaction = state => (state.tx && !state.tx.error);
const selectPendingTxHash = state => state.tx?.hash;
const selectTxError = state => state.tx?.error;

store.subscribe(() => {
    const { narrativeContract, onConnect, runnerId, runnerSig } = store.getState();
    if (onConnect) {
        store.dispatch(connectFinished());
        narrativeContract.cost().then(cost => store.dispatch(setCost({ cost })));
    }
    if (runnerId && (runnerId !== runnerSig?.tokenId)) {
        fetch(`https://2112signer.sirsean.workers.dev/runner/${runnerId}`)
            .then(r => r.json())
            .then(runnerSig => {
                store.dispatch(setRunnerSig({ runnerSig }));
            });
        if (narrativeContract) {
            narrativeContract.narrative(runnerId).then(narrative => {
                store.dispatch(setCurrentNarrative({ narrative }));
            });
        }
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
                <input type="text" name="runnerId" />
                <button>Search</button>
            </form>
        </div>
    );
}

function RunnerSig() {
    const runnerSig = useSelector(selectRunnerSig);
    const isOwner = useSelector(selectIsOwner);
    if (runnerSig) {
        return (
            <div className="RunnerSig">
            {isOwner &&
                <p>you own this runner!</p>}
            {!isOwner &&
                    <p>you do not own this runner</p>}
            </div>
        );
    }
}

function CurrentNarrative() {
    const narrative = useSelector(selectCurrentNarrative);
    if (narrative) {
        return (
            <div className="CurrentNarrative">
                {narrative}
            </div>
        );
    }
}

function NarrativeForm() {
    const isOwner = useSelector(selectIsOwner);
    const isPendingTransaction = useSelector(selectIsPendingTransaction);
    const runnerId = useSelector(selectRunnerId);
    const runnerSig = useSelector(selectRunnerSig);
    const narrative = useSelector(selectCurrentNarrative);
    const narrativeContract = useSelector(selectNarrativeContract);
    const dataContract = useSelector(selectDataContract);
    const cost = useSelector(selectCost);
    const submit = async (e) => {
        e.preventDefault();
        const { timestamp, signature } = runnerSig;
        const story = e.target.narrative.value;
        if (story === narrative) {
            return;
        }
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
                }
            }).catch(e => {
                store.dispatch(transactionFailed({ error: e.message }));
            });
    };
    if (isOwner && !isPendingTransaction) {
        return (
            <div className="NarrativeForm">
                <form onSubmit={submit}>
                    <textarea name="narrative" defaultValue={narrative || ''}></textarea>
                    <button>Save</button>
                </form>
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
                waiting for <a target="_blank" href={href}>transaction</a>
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
            <SearchBar />
            <RunnerSig />
            <CurrentNarrative />
            <NarrativeForm />
            <PendingTransaction />
            <TransactionFailed />
        </div>
    );
}

function Header() {
    const address = useSelector(selectAddress);
    const cost = useSelector(selectCost);
    return (
        <header>
            <div className="left">bio-runner</div>
            <div className="center">{address}</div>
            <div className="right">
                {cost && <span>{ethers.utils.formatUnits(cost, 18)} DATA</span>}
            </div>
        </header>
    );
}

function Footer() {
    return (
        <footer>
            by sirsean
        </footer>
    );
}

function App() {
    return (
        <Provider store={store}>
            <div className="App">
                <Header />
                <Main />
                <Footer />
            </div>
        </Provider>
    );
}

export default App;
