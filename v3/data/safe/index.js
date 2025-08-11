/* global Safe */
'use strict';

const args = new URLSearchParams(location.search);

document.getElementById('encrypt').addEventListener('click', () => {
  document.forms[0].dataset.action = 'encrypt';
});
document.getElementById('decrypt').addEventListener('click', () => {
  document.forms[0].dataset.action = 'decrypt';
});

const download = (blob, filename) => new Promise(resolve => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);

  a.click(); // triggers download

  // Give the browser a moment to handle it
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
    resolve(); // resolved after download started
  }, 500);
});

const clean = filename => {
  const dotIndex = filename.lastIndexOf('.');
  const name = dotIndex !== -1 ? filename.slice(0, dotIndex) : filename;
  const ext = dotIndex !== -1 ? filename.slice(dotIndex) : '';

  // Remove all trailing " (number)" blocks
  const cleanedName = name.replace(/(?:\s\(\d+\))+$/, '');

  return cleanedName + ext;
};

document.addEventListener('submit', async e => {
  e.preventDefault();
  const passphrase = document.getElementById('passphrase').value;
  const result = document.getElementById('result');
  const safe = new Safe();

  if (safe[e.target.dataset.action]) {
    try {
      await safe.open(passphrase);

      if (document.body.getAttribute('mode') === 'text') {
        const data = document.getElementById('data').value;

        if (e.target.dataset.action === 'encrypt') {
          result.value = 'data:application/octet-binary;base64,' + await safe.encrypt(data);
        }
        else {
          result.value = await safe.decrypt(data);
        }
      }
      else {
        const file = document.getElementById('file');
        if (file.files.length === 0) {
          throw Error('NO_INPUT_FILE');
        }
        for (const f of file.files) {
          result.value = 'Working on "' + f.name + '"...';

          const r = new Response(f);
          const data = new Uint8Array(await r.arrayBuffer());
          const converted = await safe[e.target.dataset.action](data);

          const name = e.target.dataset.action === 'encrypt' ?
            clean(f.name) + '-encrypted.bin' :
            clean(f.name).replace('-encrypted.bin', '');

          await download(converted, name);
        }

        result.value = '';
      }
    }
    catch (e) {
      console.error(e);
      result.value = e.message || 'Operation was unsuccessful';
    }
  }
});

document.getElementById('store').addEventListener('click', async () => {
  const data = document.getElementById('result').value;
  if (data.startsWith('data:application/octet-binary;base64,')) {
    const index = document.getElementById('records').selectedIndex;
    const v = index === -1 || index === 0 ? '' : document.getElementById('records').selectedOptions[0].textContent;

    const name = prompt(`Enter a unique name for this record:

>>> The old data will be removed if the name already exists <<<`, v);
    if (name) {
      try {
        await chrome.storage.sync.set({
          ['record.' + name]: data
        });

        document.getElementById('remove').disabled = false;

        // do we already have this name
        for (const option of document.getElementById('records').options) {
          if (option.textContent === name) {
            option.value = data;
            option.selected = true;

            return;
          }
        }

        const option = document.createElement('option');
        option.value = data;
        option.textContent = name;
        document.getElementById('records').appendChild(option);
        document.getElementById('records').disabled = false;
        option.selected = true;
      }
      catch (e) {
        console.error(e);
        alert('Error: ' + e.message);
      }
    }
  }
  else {
    alert('You can only store encrypted data. Use "Encrypt" button to generate one');
  }
});

if (args.has('content')) {
  document.getElementById('data').value = args.get('content');
}


chrome.storage.sync.get(null, prefs => {
  const keys = Object.keys(prefs).filter(s => s.startsWith('record.'));
  keys.sort();

  for (const key of keys) {
    const option = document.createElement('option');
    option.value = prefs[key];
    option.textContent = key.replace('record.', '');
    document.getElementById('records').appendChild(option);
  }
  if (keys.length === 0) {
    document.getElementById('records').disabled = true;
  }
  document.getElementById('rd').disabled = true;
});

document.getElementById('records').onchange = e => {
  const index = e.target.selectedIndex;
  const n = index === 0 || index === -1;

  document.getElementById('data').value = n ? '' : document.getElementById('records').selectedOptions[0].value;
  document.getElementById('result').value = '';
  document.getElementById('remove').disabled = n;
};

document.getElementById('remove').onclick = () => {
  if (confirm('Are you sure?')) {
    const [option] = document.getElementById('records').selectedOptions;
    const v = option.textContent;

    chrome.storage.sync.remove('record.' + v);
    chrome.contextMenus.remove('record.' + v);

    document.getElementById('records').selectedIndex -= 1;
    option.remove();
    document.getElementById('records').dispatchEvent(new Event('change'));
  }
};

document.getElementById('swap').onclick = () => {
  const v1 = document.getElementById('data').value;
  const v2 = document.getElementById('result').value;

  document.getElementById('data').value = v2;
  document.getElementById('result').value = v1;
};

document.getElementById('data').oninput = () => {
  document.getElementById('result').value = '';
};


document.getElementById('mode').onchange = e => {
  document.body.setAttribute('mode', e.target.value);
  if (e.target.value === 'text') {
    document.getElementById('data').setAttribute('required', 'required');
    document.getElementById('swap').disabled = false;
    document.getElementById('records').disabled = false;
    document.getElementById('store').disabled = false;
  }
  else {
    document.getElementById('data').removeAttribute('required');
    document.getElementById('swap').disabled = true;
    document.getElementById('records').disabled = true;
    document.getElementById('store').disabled = true;
  }

  if (e.isTrusted) {
    chrome.storage.local.set({
      mode: e.target.value
    });
  }
};

chrome.storage.local.get({
  mode: 'text'
}).then(prefs => {
  document.getElementById(prefs.mode + '-mode').checked = true;
  document.getElementById(prefs.mode + '-mode').dispatchEvent(new Event('change', {
    bubbles: true
  }));
});

{
  const dropZone = document.getElementById('file-container');
  dropZone.addEventListener('dragover', e => {
    e.preventDefault(); // Required to make drop work
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    const dt = new DataTransfer();
    for (const item of e.dataTransfer.items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry && entry.isDirectory) {
          continue; // skip directories
        }
        const file = item.getAsFile();
        if (file) {
          dt.items.add(file);
        }
      }
    }
    document.getElementById('file').files = dt.files;
  });
}
