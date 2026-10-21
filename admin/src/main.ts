// Điểm vào của trang quản trị: gắn App vào #app.
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
