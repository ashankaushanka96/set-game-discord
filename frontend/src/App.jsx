import { useStore } from './store';
import Lobby from './components/Lobby';
import Table from './components/Table';
import './styles.css';

export default function App(){
  const { state, phase } = useStore();
  if(!state || phase==='lobby') return <Lobby/>;
  return <Table/>;
}
