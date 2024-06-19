import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';

class BasicCharacterControllerProxy {
    constructor(animations) {
        this._animations = animations;
    }

    get animations() {
        return this._animations;
    }
};

class BasicCharacterController {
    constructor(params) {
        this._Init(params);
    }

    _Init(params) {
        this._params = params;
        this._deceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
        this._acceleration = new THREE.Vector3(1.25, 0.35, 70.0);
        this._velocity = new THREE.Vector3(0, 0, 0);

        this._animations = {};
        this._input = new BasicCharacterControllerInput();
        this._stateMachine = new CharacterFSM(
            new BasicCharacterControllerProxy(this._animations));

        this._LoadModels();
    }

    _LoadModels() {
        const loader = new FBXLoader();
        loader.setPath('./resources/');
        loader.load('soldado.fbx', (fbx) => {
            fbx.scale.setScalar(0.1);
            fbx.traverse(c => {
                c.castShadow = true;
            });

            this._target = fbx;
            this._params.scene.add(this._target);

            this._mixer = new THREE.AnimationMixer(this._target);

            this._manager = new THREE.LoadingManager();
            this._manager.onLoad = () => {
                this._stateMachine.SetState('descanso');
            };

            const _OnLoad = (animName, anim) => {
                const clip = anim.animations[0];
                const action = this._mixer.clipAction(clip);

                this._animations[animName] = {
                    clip: clip,
                    action: action,
                };
            };

            const loader = new FBXLoader(this._manager);
            loader.setPath('./resources/');
            loader.load('caminar.fbx', (a) => { _OnLoad('caminar', a); });
            loader.load('correr.fbx', (a) => { _OnLoad('correr', a); });
            loader.load('descanso.fbx', (a) => { _OnLoad('descanso', a); });
            loader.load('reversa.fbx', (a) => { _OnLoad('reversa', a); });
            loader.load('danza.fbx', (a) => { _OnLoad('danza', a); }); 
        });
    }

    Update(timeInSeconds) {
        if (!this._target) {
            return;
        }

        this._stateMachine.Update(timeInSeconds, this._input);

        const velocity = this._velocity;
        const framedeceleration = new THREE.Vector3(
            velocity.x * this._deceleration.x,
            velocity.y * this._deceleration.y,
            velocity.z * this._deceleration.z
        );
        framedeceleration.multiplyScalar(timeInSeconds);
        framedeceleration.z = Math.sign(framedeceleration.z) * Math.min(
            Math.abs(framedeceleration.z), Math.abs(velocity.z));

        velocity.add(framedeceleration);

        const controlObject = this._target;
        const _Q = new THREE.Quaternion();
        const _A = new THREE.Vector3();
        const _R = controlObject.quaternion.clone();

        const acc = this._acceleration.clone();
        if (this._input._keys.shift) {
            acc.multiplyScalar(3.0);
        }

        if (this._input._keys.forward) {
            velocity.z += acc.z * timeInSeconds;
        }
        if (this._input._keys.backward) {
            velocity.z -= acc.z * timeInSeconds;
        }
        if (this._input._keys.left) {
            _A.set(0, 1, 0);
            _Q.setFromAxisAngle(_A, 4.0 * Math.PI * timeInSeconds * this._acceleration.y);
            _R.multiply(_Q);
        }
        if (this._input._keys.right) {
            _A.set(0, 1, 0);
            _Q.setFromAxisAngle(_A, 4.0 * -Math.PI * timeInSeconds * this._acceleration.y);
            _R.multiply(_Q);
        }

        controlObject.quaternion.copy(_R);

        const oldPosition = new THREE.Vector3();
        oldPosition.copy(controlObject.position);

        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(controlObject.quaternion);
        forward.normalize();

        const sideways = new THREE.Vector3(1, 0, 0);
        sideways.applyQuaternion(controlObject.quaternion);
        sideways.normalize();

        sideways.multiplyScalar(velocity.x * timeInSeconds);
        forward.multiplyScalar(velocity.z * timeInSeconds);

        controlObject.position.add(forward);
        controlObject.position.add(sideways);

        oldPosition.copy(controlObject.position);

        if (this._mixer) {
            this._mixer.update(timeInSeconds);
        }
    }
};

class BasicCharacterControllerInput {
    constructor() {
        this._Init();
    }

    _Init() {
        this._keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            space: false,
            shift: false,
            dance: false, 
        };
        document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
        document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
    }

    _onKeyDown(event) {
        switch (event.keyCode) {
            case 87: // w
                this._keys.forward = true;
                break;
            case 65: // a
                this._keys.left = true;
                break;
            case 83: // s
                this._keys.backward = true;
                break;
            case 68: // d
                this._keys.right = true;
                break;
            case 32: // SPACE
                this._keys.space = true;
                break;
            case 16: // SHIFT
                this._keys.shift = true;
                break;
            case 66: // B
                this._keys.dance = true;
                break;
        }
    }

    _onKeyUp(event) {
        switch (event.keyCode) {
            case 87: // w
                this._keys.forward = false;
                break;
            case 65: // a
                this._keys.left = false;
                break;
            case 83: // s
                this._keys.backward = false;
                break;
            case 68: // d
                this._keys.right = false;
                break;
            case 32: // SPACE
                this._keys.space = false;
                break;
            case 16: // SHIFT
                this._keys.shift = false;
                break;
            case 66: // B
                this._keys.dance = false;
                break;
        }
    }
};

class FiniteStateMachine {
    constructor() {
        this._states = {};
        this._currentState = null;
    }

    _AddState(name, type) {
        this._states[name] = type;
    }

    SetState(name) {
        const prevState = this._currentState;

        if (prevState) {
            if (prevState.Name == name) {
                return;
            }
            prevState.Exit();
        }

        const state = new this._states[name](this);

        this._currentState = state;
        state.Enter(prevState);
    }

    Update(timeElapsed, input) {
        if (this._currentState) {
            this._currentState.Update(timeElapsed, input);
        }
    }
};

class CharacterFSM extends FiniteStateMachine {
    constructor(proxy) {
        super();
        this._proxy = proxy;
        this._Init();
    }

    _Init() {
        this._AddState('descanso', IdleState);
        this._AddState('caminar', WalkState);
        this._AddState('correr', RunState);
        this._AddState('reversa', ReverseState);
        this._AddState('danza', DanceState); 
    }
};

class State {
    constructor(parent) {
        this._parent = parent;
    }

    Enter() { }
    Exit() { }
    Update() { }
};

class WalkState extends State {
    constructor(parent) {
        super(parent);
    }

    get Name() {
        return 'caminar';
    }

    Enter(prevState) {
        const curAction = this._parent._proxy._animations['caminar'].action;
        if (prevState) {
            const prevAction = this._parent._proxy._animations[prevState.Name].action;

            curAction.enabled = true;

            if (prevState.Name == 'correr' || prevState.Name == 'reversa') {
                const ratio = curAction.getClip().duration / prevAction.getClip().duration;
                curAction.time = prevAction.time * ratio;
            } else {
                curAction.time = 0.0;
                curAction.setEffectiveTimeScale(1.0);
                curAction.setEffectiveWeight(1.0);
            }

            curAction.crossFadeFrom(prevAction, 0.5, true);
            curAction.play();
        } else {
            curAction.play();
        }
    }

    Exit() {
    }

    Update(_, input) {
        if (input._keys.forward) {
            if (input._keys.shift) {
                this._parent.SetState('correr');
            }
            return;
        } else if (input._keys.backward) {
            this._parent.SetState('reversa');
            return;
        } else if (input._keys.dance) {
            this._parent.SetState('danza');
            return;
        }

        this._parent.SetState('descanso');
    }
};

class RunState extends State {
    constructor(parent) {
        super(parent);
    }

    get Name() {
        return 'correr';
    }

    Enter(prevState) {
        const curAction = this._parent._proxy._animations['correr'].action;
        if (prevState) {
            const prevAction = this._parent._proxy._animations[prevState.Name].action;

            curAction.enabled = true;

            if (prevState.Name == 'caminar' || prevState.Name == 'reversa') {
                const ratio = curAction.getClip().duration / prevAction.getClip().duration;
                curAction.time = prevAction.time * ratio;
            } else {
                curAction.time = 0.0;
                curAction.setEffectiveTimeScale(1.0);
                curAction.setEffectiveWeight(1.0);
            }

            curAction.crossFadeFrom(prevAction, 0.5, true);
            curAction.play();
        } else {
            curAction.play();
        }
    }

    Exit() {
    }

    Update(timeElapsed, input) {
        if (input._keys.forward) {
            if (!input._keys.shift) {
                this._parent.SetState('caminar');
            }
            return;
        } else if (input._keys.backward) {
            this._parent.SetState('reversa');
            return;
        } else if (input._keys.dance) {
            this._parent.SetState('danza');
            
            return;
        }

        this._parent.SetState('descanso');
    }
};

class ReverseState extends State {
    constructor(parent) {
        super(parent);
    }

    get Name() {
        return 'reversa';
    }

    Enter(prevState) {
        const curAction = this._parent._proxy._animations['reversa'].action;
        if (prevState) {
            const prevAction = this._parent._proxy._animations[prevState.Name].action;

            curAction.enabled = true;

            if (prevState.Name == 'caminar' || prevState.Name == 'correr') {
                const ratio = curAction.getClip().duration / prevAction.getClip().duration;
                curAction.time = prevAction.time * ratio;
            } else {
                curAction.time = 0.0;
                curAction.setEffectiveTimeScale(1.0);
                curAction.setEffectiveWeight(1.0);
            }

            curAction.crossFadeFrom(prevAction, 0.5, true);
            curAction.play();
        } else {
            curAction.play();
        }
    }

    Exit() {
    }

    Update(timeElapsed, input) {
        if (input._keys.backward) {
            return;
        } else if (input._keys.forward) {
            this._parent.SetState('caminar');
            return;
        } else if (input._keys.dance) {
            this._parent.SetState('danza');
            return;
        }

        this._parent.SetState('descanso');
    }
};

class IdleState extends State {
    constructor(parent) {
        super(parent);
    }

    get Name() {
        return 'descanso';
    }

    Enter(prevState) {
        const idleAction = this._parent._proxy._animations['descanso'].action;
        if (prevState) {
            const prevAction = this._parent._proxy._animations[prevState.Name].action;
            idleAction.time = 0.0;
            idleAction.enabled = true;
            idleAction.setEffectiveTimeScale(1.0);
            idleAction.setEffectiveWeight(1.0);
            idleAction.crossFadeFrom(prevAction, 0.5, true);
            idleAction.play();
        } else {
            idleAction.play();
        }
    }

    Exit() {
    }

    Update(_, input) {
        if (input._keys.forward) {
            this._parent.SetState('caminar');
        } else if (input._keys.backward) {
            this._parent.SetState('reversa');
        } else if (input._keys.dance) {
            this._parent.SetState('danza');
        }
    }
};

class DanceState extends State {
    constructor(parent) {
        super(parent);
    }

    get Name() {
        return 'danza';
    }

    Enter(prevState) {
        const curAction = this._parent._proxy._animations['danza'].action;
        if (prevState) {
            const prevAction = this._parent._proxy._animations[prevState.Name].action;

            curAction.enabled = true;
            curAction.time = 0.0;
            curAction.setEffectiveTimeScale(1.0);
            curAction.setEffectiveWeight(1.0);

            curAction.crossFadeFrom(prevAction, 0.5, true);
            curAction.play();
        } else {
            curAction.play();
        }
    }

    Exit() {
    }

    Update(_, input) {
        if (!input._keys.dance) {
            this._parent.SetState('descanso');
        }
    }
};

class CharacterControllerDemo {
    constructor() {
        this._Initialize();
    }

    _Initialize() {
        this._threejs = new THREE.WebGLRenderer({
            antialias: true,
        });
        this._threejs.outputEncoding = THREE.sRGBEncoding;
        this._threejs.shadowMap.enabled = true;
        this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
        this._threejs.setPixelRatio(window.devicePixelRatio);
        this._threejs.setSize(window.innerWidth, window.innerHeight);

        document.body.appendChild(this._threejs.domElement);

        window.addEventListener('resize', () => {
            this._OnWindowResize();
        }, false);

        const fov = 60;
        const aspect = window.innerWidth / window.innerHeight;
        const near = 1.0;
        const far = 1000.0;
        this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        this._camera.position.set(25, 10, 25);

        this._scene = new THREE.Scene();

        let light = new THREE.DirectionalLight(0xD94242, 1.0); //aqui se cambia el color de la luz de la escena
        light.position.set(-100, 100, 100);
        light.target.position.set(0, 0, 0);
        light.castShadow = true;
        light.shadow.bias = -0.001;
        light.shadow.mapSize.width = 4096;
        light.shadow.mapSize.height = 4096;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 500.0;
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = 500.0;
        light.shadow.camera.left = 50;
        light.shadow.camera.right = -50;
        light.shadow.camera.top = 50;
        light.shadow.camera.bottom = -50;
        this._scene.add(light);
        this._scene.fog = new THREE.Fog(0xB471E6, 0.1); //aqui se cambia el color de la niebla y la densidad siendo 0.001 la densidad que  es la mas baja, la mas al

        light = new THREE.AmbientLight(0xD94242, 0.50); //aqui se cambia el color de la luz
        this._scene.add(light);

        const controls = new OrbitControls(
            this._camera, this._threejs.domElement);
        controls.target.set(0, 10, 0);
        controls.update();

        const textureLoader = new THREE.TextureLoader();
        const groundTexture = textureLoader.load('./textures/base.jpg');
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(25, 25);

        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 1000, 10, 10),
            new THREE.MeshStandardMaterial({
                map: groundTexture,
            })
        );
        plane.castShadow = false;
        plane.receiveShadow = true;
        plane.rotation.x = -Math.PI / 2;
        this._scene.add(plane);
        const geometry = new THREE.BoxGeometry();
geometry.translate(0, 0.5, 0);
const material = new THREE.MeshPhongMaterial({ color: 0x235D25, flatShading: true });

for (let i = 0; i < 500; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = Math.random() * 1600 - 800;
    mesh.position.y = 0;
    mesh.position.z = Math.random() * 1600 - 800;
    mesh.scale.x = Math.random() * 30 + 30;
    mesh.scale.y = 30;
    mesh.scale.z = Math.random() * 30 + 30;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    this._scene.add(mesh);
}


        this._mixers = [];
        this._previousRAF = null;

        this._LoadAnimatedModel();
        this._RAF();
    }

    _LoadAnimatedModel() {
        const params = {
            camera: this._camera,
            scene: this._scene,
        }
        this._controls = new BasicCharacterController(params);
    }

    _OnWindowResize() {
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        this._threejs.setSize(window.innerWidth, window.innerHeight);
    }

    _RAF() {
        requestAnimationFrame((t) => {
            if (this._previousRAF === null) {
                this._previousRAF = t;
            }

            this._RAF();

            this._threejs.render(this._scene, this._camera);

            this._Step(t - this._previousRAF);
            this._previousRAF = t;
        });
    }

    _Step(timeElapsed) {
        const timeElapsedS = timeElapsed * 0.001;
        if (this._mixers) {
            this._mixers.map(m => m.update(timeElapsedS));
        }

        if (this._controls) {
            this._controls.Update(timeElapsedS);
        }
    }
}

let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
    _APP = new CharacterControllerDemo();
});

