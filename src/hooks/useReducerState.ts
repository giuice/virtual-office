import { Dispatch, SetStateAction, useReducer } from 'react';

function reducerState<S>(state: S, action: SetStateAction<S>): S {
  return typeof action === 'function'
    ? (action as (previousState: S) => S)(state)
    : action;
}

export function useReducerState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>] {
  return useReducer(
    reducerState<S>,
    undefined as S,
    () => (typeof initialState === 'function' ? (initialState as () => S)() : initialState)
  );
}
