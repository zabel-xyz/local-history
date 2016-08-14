var objects = {file1: null, file2: null},
    objHRef = null;

function initialize() {
    var object = document.querySelector("input[type='checkbox']:checked");
    if (object)
        chkCompareClick(object);
}

function updateHRef() {
    var file1, file2;

    if (objHRef === null)
        objHRef = document.getElementById('diffHRef');

    if (objects.file1 === null || objects.file2 === null) {
        objHRef.setAttribute('href', encodeURI('command:local-history.compare?'));
        return;
    }

    // if file1 is current version, inverse files, to be not readOnly in compare
    if (objects.file1.getAttribute('data-current')) {
        file1 = objects.file2;
        file2 = objects.file1;
    } else {
        file1 = objects.file1;
        file2 = objects.file2;
    }
    file1 = JSON.parse(decodeURI(file1.getAttribute('data-historyFile')));
    file2 = JSON.parse(decodeURI(file2.getAttribute('data-historyFile')));

    column = objHRef.getAttribute('data-column');
    objHRef.setAttribute('href', encodeURI('command:local-history.compare?'+JSON.stringify([file1, file2, column])));
}

function chkCompareClick(object) {
    if (object.checked) {
        if (objects.file1 === null) {
            objects.file1 = object;
        } else {
            if (objects.file2 !== null)
                objects.file2.checked = false;
            objects.file2 = object;
        }
    } else {
        if (object === objects.file1) {
            objects.file1 = objects.file2;
            objects.file2 = null;
        } else if (object === objects.file2) {
            objects.file2 = null;
        } else
            console.log('Something go wrong');
    }
    updateHRef();
}
