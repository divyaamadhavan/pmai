import { createContext, useContext, useState, ReactNode } from 'react';

interface AgentStatusContextType {
  agentRunning: boolean;
  agentLabel: string;
  setAgentRunning: (label: string) => void;
  clearAgentRunning: () => void;
}

const AgentStatusContext = createContext<AgentStatusContextType>({
  agentRunning: false,
  agentLabel: '',
  setAgentRunning: () => {},
  clearAgentRunning: () => {},
});

export function AgentStatusProvider({ children }: { children: ReactNode }) {
  const [agentRunning, setRunning] = useState(false);
  const [agentLabel, setLabel] = useState('');

  return (
    <AgentStatusContext.Provider value={{
      agentRunning,
      agentLabel,
      setAgentRunning: (label) => { setRunning(true); setLabel(label); },
      clearAgentRunning: () => { setRunning(false); setLabel(''); },
    }}>
      {children}
    </AgentStatusContext.Provider>
  );
}

export const useAgentStatus = () => useContext(AgentStatusContext);
